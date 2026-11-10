import { userFromApiToken } from "@/lib/auth";
import { schoolOccurrences } from "@/lib/calendar";
import { loadCalendarRange } from "@/lib/calendar-data";
import { db } from "@/lib/db";
import { notFound, route } from "@/lib/http";
import { toIcal, type FeedEvent } from "@/lib/ical-export";
import { addDays, today } from "@/lib/plan-utils";
import { listPlans, toExceptionDTO, toSlotDTO } from "@/lib/plans";
import { ensureSettings } from "@/lib/settings";
import type { EventDTO } from "@/lib/types";

// GET /api/feed/<token> → l'orario in formato iCal, da 3 mesi fa a un anno da oggi:
// lezioni (con il titolo del piano), eventi e vacanze. Il token (ambito "feed") sostituisce
// l'accesso: chi ha il link vede l'orario, quindi si crea e si revoca dalle Impostazioni.
export const GET = route<{ token: string }>(async (_req, { token }) => {
  const found = await userFromApiToken(token.replace(/\.ics$/, ""), ["feed"]);
  if (!found) throw notFound();
  const userId = found.user.id;
  const from = addDays(today(), -90);
  const to = addDays(today(), 365);
  const settings = await ensureSettings(userId);

  const [slots, exceptions, events, plans, range] = await Promise.all([
    db.timetableSlot.findMany({ where: { userId } }).then((s) => s.map(toSlotDTO)),
    db.lessonException.findMany({ where: { slot: { userId }, date: { gte: from, lte: to } } }).then((e) => e.map(toExceptionDTO)),
    db.event.findMany({ where: { userId, date: { gte: from, lte: to } }, omit: { userId: true } }) as Promise<EventDTO[]>,
    listPlans(userId, { isTemplate: false, date: { gte: from, lte: to } }),
    loadCalendarRange(userId, settings, from, to),
  ]);
  const holidays = new Set(range.holidays.map((h) => h.date));
  const planOf = new Map(plans.flatMap((p) => p.slotIds.map((id) => [`${p.date}|${id}`, p.title || "Piano senza titolo"])));

  const out: FeedEvent[] = [];
  for (let date = from; date <= to; date = addDays(date, 1)) {
    for (const o of schoolOccurrences(date, slots, exceptions, holidays, events)) {
      if (o.cancelled) continue;
      const plan = planOf.get(`${date}|${o.slot.id}`);
      out.push({
        uid: `${o.slot.id}-${date}@pianostudio`,
        title: [o.slot.subject, o.slot.className].filter(Boolean).join(" · "),
        date,
        startTime: o.startTime,
        endTime: o.endTime,
        location: o.room ? `Aula ${o.room}` : undefined,
        description: plan ? `Piano: ${plan}` : undefined,
      });
    }
  }
  for (const e of events) {
    out.push({ uid: `${e.id}@pianostudio`, title: e.title, date: e.date, startTime: e.startTime, endTime: e.endTime, description: e.note || undefined });
  }
  // Vacanze: un solo evento per ogni periodo continuo con lo stesso nome.
  let period: FeedEvent | null = null;
  for (const h of range.holidays) {
    if (period && period.title === h.name && addDays(period.lastDate!, 1) === h.date) {
      period.lastDate = h.date;
      continue;
    }
    period = { uid: `vacanza-${h.date}@pianostudio`, title: h.name, date: h.date, lastDate: h.date, startTime: null, endTime: null };
    out.push(period);
  }

  return new Response(toIcal("PianoStudio", out), {
    headers: { "Content-Type": "text/calendar; charset=utf-8", "Cache-Control": "private, max-age=900" },
  });
});
