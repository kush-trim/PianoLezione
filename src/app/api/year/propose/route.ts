import { requireUser } from "@/lib/auth";
import { occurrencesOn, yearWeeks } from "@/lib/calendar";
import { loadCalendarRange } from "@/lib/calendar-data";
import { db } from "@/lib/db";
import { readJson, route } from "@/lib/http";
import { addDays, mondayOf } from "@/lib/plan-utils";
import { getPlan, listPlans, toExceptionDTO, toSlotDTO } from "@/lib/plans";
import { ensureSettings } from "@/lib/settings";
import type { EventDTO, PlanDTO, ProposalDTO } from "@/lib/types";
import { proposeSchema } from "@/lib/validation";
import { classFromFolders, groupLessons, proposeLessons, weeksWithLessons, type SourceInfo } from "@/lib/year-proposal";

// POST /api/year/propose → per i piani appena arrivati in una cartella di un anno scolastico
// ("Anno 2027/2028" o una sua sottocartella), la settimana e la lezione proposte in quell'anno.
// null se la cartella non appartiene a un anno o se tutti i piani sono già in quell'anno.
export const POST = route(async (req): Promise<ProposalDTO | null> => {
  const user = await requireUser();
  const data = proposeSchema.parse(await readJson(req));
  const settings = await ensureSettings(user.id);

  const folders = await db.folder.findMany({
    where: { userId: user.id },
    select: { id: true, parentId: true, name: true, schoolYearId: true },
  });
  const byId = new Map(folders.map((f) => [f.id, f]));
  const chain = (id: string | null) => {
    const out: typeof folders = [];
    for (let cur = id; cur && byId.has(cur); cur = byId.get(cur)!.parentId) out.push(byId.get(cur)!);
    return out;
  };
  const yearFolder = chain(data.targetFolderId).find((f) => f.schoolYearId);
  if (!yearFolder?.schoolYearId) return null;
  const year = await db.schoolYear.findFirst({
    where: { id: yearFolder.schoolYearId, userId: user.id },
    select: { id: true, name: true, startDate: true, endDate: true },
  });
  if (!year) return null;

  const ids = data.plans.map((p) => p.planId);
  const [targets, allSlots, years] = await Promise.all([
    Promise.all(ids.map((id) => getPlan(user.id, id))),
    db.timetableSlot.findMany({ where: { userId: user.id } }).then((s) => s.map(toSlotDTO)),
    db.schoolYear.findMany({ where: { userId: user.id }, select: { id: true, startDate: true, endDate: true } }),
  ]);
  // Solo i piani che non sono già in quell'anno.
  const inYear = (d: string | null) => !!d && d >= year.startDate && d <= year.endDate;
  const todo = data.plans.filter((_, i) => !inYear(targets[i].date));
  if (todo.length === 0) return null;

  // --- Il nuovo anno: settimane e lezioni ---
  const yearSlots = allSlots.filter(
    (s) => (!s.validFrom || s.validFrom <= year.endDate) && (!s.validTo || s.validTo >= year.startDate),
  );
  const [range, exceptions, events, existing] = await Promise.all([
    loadCalendarRange(user.id, settings, year.startDate, year.endDate),
    db.lessonException.findMany({ where: { slot: { userId: user.id }, date: { gte: year.startDate, lte: year.endDate } } }),
    db.event.findMany({
      where: { userId: user.id, cancelsLessons: true, date: { gte: year.startDate, lte: year.endDate } },
      omit: { userId: true },
    }),
    listPlans(user.id, { isTemplate: false, date: { gte: year.startDate, lte: year.endDate }, id: { notIn: ids } }),
  ]);
  const taken = new Set(existing.flatMap((p) => p.slotIds.map((id) => `${p.date}|${id}`)));
  const holidayList = range.holidays.map((h) => ({ name: h.name, startDate: h.date, endDate: h.date }));
  const weeks = weeksWithLessons(
    year,
    yearWeeks(year, holidayList),
    yearSlots,
    exceptions.map(toExceptionDTO),
    new Set(range.holidays.map((h) => h.date)),
    events as EventDTO[],
    taken,
  );

  // --- Da dove vengono i piani: settimana e posizione nell'anno di provenienza ---
  const sourceIds = todo.map((p) => p.sourceId ?? p.planId);
  const sources = new Map<string, PlanDTO>(
    (await Promise.all([...new Set(sourceIds)].map((id) => getPlan(user.id, id).catch(() => null))))
      .filter((p): p is PlanDTO => !!p)
      .map((p) => [p.id, p]),
  );
  const weekNumberCache = new Map<string, Map<string, number | null>>();
  async function weekNumber(date: string): Promise<number | null> {
    const y = years.find((x) => date >= x.startDate && date <= x.endDate);
    if (!y) return null;
    if (!weekNumberCache.has(y.id)) {
      const r = y.id === year!.id ? range : await loadCalendarRange(user.id, settings, y.startDate, y.endDate);
      const ws = yearWeeks(y, r.holidays.map((h) => ({ name: h.name, startDate: h.date, endDate: h.date })));
      weekNumberCache.set(y.id, new Map(ws.map((w) => [w.monday, w.number])));
    }
    return weekNumberCache.get(y.id)!.get(mondayOf(date)) ?? null;
  }

  const classNames = [...new Set(yearSlots.map((s) => s.className))];
  const infos: SourceInfo[] = [];
  for (const [i, item] of todo.entries()) {
    const target = targets[ids.indexOf(item.planId)];
    const src = sources.get(sourceIds[i]) ?? target;
    const first = src.slots[0];
    let index = 0;
    if (src.date && first) {
      // Posizione della lezione tra quelle della stessa classe e materia nella sua settimana.
      const monday = mondayOf(src.date);
      const occs = Array.from({ length: 7 }, (_, d) => occurrencesOn(addDays(monday, d), allSlots, [])).flat();
      const lessons = groupLessons(occs, new Set()).filter((l) => l.subject === first.subject && l.className === first.className);
      index = Math.max(0, lessons.findIndex((l) => l.date === src.date && l.slotIds.includes(first.id)));
    }
    // Le cartelle tra il piano e la cartella dell'anno, dalla più vicina.
    const up = chain(target.folderId);
    const folderNames = up.slice(0, Math.max(0, up.findIndex((f) => f.id === yearFolder.id))).map((f) => f.name);
    infos.push({
      planId: item.planId,
      title: target.title,
      date: src.date,
      week: src.date ? await weekNumber(src.date) : null,
      subject: first?.subject ?? null,
      className: first?.className ?? null,
      index,
      classHint: classFromFolders(folderNames, classNames),
    });
  }

  const proposals = proposeLessons(infos, weeks);
  return {
    year,
    weeks,
    plans: infos.map((s, i) => ({
      planId: s.planId,
      title: s.title,
      sourceDate: s.date,
      sourceWeek: s.week,
      monday: proposals[i].monday,
      date: proposals[i].date,
      slotIds: proposals[i].slotIds,
    })),
  };
});
