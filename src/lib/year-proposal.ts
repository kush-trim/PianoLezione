// Nuovo anno: in quale settimana (e lezione) rifare un piano dell'anno precedente.
// Funzioni pure, condivise dal server e dai test.

import { schoolOccurrences, type YearWeek } from "./calendar";
import { addDays, consecutiveSlots, weekdayOf } from "./plan-utils";
import { toMin } from "./schedule";
import type { EventDTO, ExceptionDTO, LessonOption, Occurrence, SlotDTO } from "./types";

export type WeekLessons = { monday: string; number: number; lessons: LessonOption[] };

const norm = (s: string) => s.trim().toLowerCase();

/** Le ore consecutive della stessa classe e materia diventano una sola lezione (lezione doppia). */
export function groupLessons(occurrences: Occurrence[], taken: Set<string>): LessonOption[] {
  const active = occurrences.filter((o) => !o.cancelled);
  const seen = new Set<string>();
  const out: LessonOption[] = [];
  for (const o of active) {
    if (seen.has(o.slot.id)) continue;
    const group = consecutiveSlots(o.slot, active.map((a) => a.slot));
    const occs = group.map((s) => active.find((a) => a.slot.id === s.id)!).filter(Boolean);
    for (const g of occs) seen.add(g.slot.id);
    out.push({
      date: o.date,
      slotIds: occs.map((g) => g.slot.id),
      startTime: occs[0].startTime,
      endTime: occs[occs.length - 1].endTime,
      subject: o.slot.subject,
      className: o.slot.className,
      taken: occs.some((g) => taken.has(`${o.date}|${g.slot.id}`)),
    });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || toMin(a.startTime) - toMin(b.startTime));
}

/** Le settimane di scuola di un anno con le loro lezioni (senza vacanze ed eventi che le tolgono). */
export function weeksWithLessons(
  year: { startDate: string; endDate: string },
  weeks: YearWeek[],
  slots: SlotDTO[],
  exceptions: ExceptionDTO[],
  holidays: Set<string>,
  events: Pick<EventDTO, "date" | "startTime" | "endTime" | "className" | "cancelsLessons" | "title">[],
  taken: Set<string>,
): WeekLessons[] {
  return weeks
    .filter((w): w is YearWeek & { number: number } => w.number !== null)
    .map((w) => {
      const days = Array.from({ length: 7 }, (_, i) => addDays(w.monday, i)).filter(
        (d) => d >= year.startDate && d <= year.endDate,
      );
      const occs = days.flatMap((d) => schoolOccurrences(d, slots, exceptions, holidays, events));
      return { monday: w.monday, number: w.number, lessons: groupLessons(occs, taken) };
    });
}

export type SourceInfo = {
  planId: string;
  title: string;
  date: string | null;
  /** Numero della settimana nell'anno di provenienza. */
  week: number | null;
  subject: string | null;
  className: string | null;
  /** La lezione era la n-esima (da 0) di quella classe e materia nella sua settimana. */
  index: number;
  /** Nome di una cartella che corrisponde a una classe del nuovo anno (es. "3A"). */
  classHint: string | null;
};

export type Proposal = { planId: string; monday: string | null; date: string | null; slotIds: string[] };

/**
 * Propone, per ogni piano, la stessa settimana dell'anno precedente (stesso numero) e, dentro la
 * settimana, la lezione della stessa classe e materia nella stessa posizione (prima, seconda…).
 * Due piani non finiscono mai sulla stessa lezione, e le lezioni che hanno già un piano si evitano.
 * Se nella settimana non c'è una lezione adatta si propone solo il giorno della settimana originale.
 */
export function proposeLessons(sources: SourceInfo[], weeks: WeekLessons[]): Proposal[] {
  const used = new Set<string>();
  const key = (l: LessonOption) => `${l.date}|${l.slotIds.join(",")}`;
  const ordered = [...sources].sort((a, b) => (a.date ?? "9999").localeCompare(b.date ?? "9999") || a.index - b.index);
  const out = new Map<string, Proposal>();

  for (const s of ordered) {
    if (!s.date || s.week === null || weeks.length === 0) {
      out.set(s.planId, { planId: s.planId, monday: null, date: null, slotIds: [] });
      continue;
    }
    const week = weeks.find((w) => w.number === s.week) ?? weeks[weeks.length - 1];
    const wantClass = s.classHint ?? s.className;
    const score = (l: LessonOption) =>
      (wantClass && norm(l.className) === norm(wantClass) ? 2 : 0) + (s.subject && norm(l.subject) === norm(s.subject) ? 1 : 0);
    const best = Math.max(0, ...week.lessons.map(score));
    const matching = best > 0 ? week.lessons.filter((l) => score(l) === best && !l.taken) : [];
    const free = (l: LessonOption) => !used.has(key(l));
    // La lezione nella stessa posizione; se è occupata la prima libera dopo, poi prima.
    const pick =
      (matching[s.index] && free(matching[s.index]) ? matching[s.index] : undefined) ??
      matching.slice(s.index + 1).find(free) ??
      matching.slice(0, s.index).reverse().find(free);

    if (pick) {
      used.add(key(pick));
      out.set(s.planId, { planId: s.planId, monday: week.monday, date: pick.date, slotIds: pick.slotIds });
    } else {
      out.set(s.planId, {
        planId: s.planId,
        monday: week.monday,
        date: addDays(week.monday, Math.min(weekdayOf(s.date), 5) - 1),
        slotIds: [],
      });
    }
  }
  return sources.map((s) => out.get(s.planId)!);
}

/** Il nome di cartella più vicino al piano che corrisponde a una classe dell'orario. */
export function classFromFolders(folderNames: string[], classNames: string[]): string | null {
  const classes = new Map(classNames.filter((c) => c.trim()).map((c) => [norm(c), c]));
  for (const name of folderNames) {
    const hit = classes.get(norm(name));
    if (hit) return hit;
  }
  return null;
}
