import { requireUser } from "@/lib/auth";
import { yearFor, yearWeeks } from "@/lib/calendar";
import { loadCalendarRange } from "@/lib/calendar-data";
import { db } from "@/lib/db";
import { route } from "@/lib/http";
import { addDays, mondayOf, today } from "@/lib/plan-utils";
import { listPlans, toExceptionDTO, toSlotDTO } from "@/lib/plans";
import { ensureSettings } from "@/lib/settings";
import type { EventDTO, WeekDTO } from "@/lib/types";
import { dateParam } from "@/lib/validation";

// GET /api/week?date=YYYY-MM-DD → tutto ciò che serve per la settimana che contiene la data.
export const GET = route(async (req): Promise<WeekDTO> => {
  const user = await requireUser();
  const raw = new URL(req.url).searchParams.get("date");
  const monday = mondayOf(raw ? dateParam.parse(raw) : today());
  const days = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  const [from, to] = [days[0], days[6]];
  const settings = await ensureSettings(user.id);

  const [slots, exceptions, events, plans, years] = await Promise.all([
    // Solo le lezioni ricorrenti valide almeno un giorno di questa settimana.
    db.timetableSlot.findMany({
      where: {
        userId: user.id,
        AND: [
          { OR: [{ validFrom: null }, { validFrom: { lte: to } }] },
          { OR: [{ validTo: null }, { validTo: { gte: from } }] },
        ],
      },
      orderBy: [{ weekday: "asc" }, { startTime: "asc" }],
    }),
    db.lessonException.findMany({ where: { slot: { userId: user.id }, date: { gte: from, lte: to } } }),
    db.event.findMany({
      where: { userId: user.id, date: { gte: from, lte: to } },
      orderBy: [{ date: "asc" }, { startTime: "asc" }],
      omit: { userId: true },
    }),
    listPlans(user.id, { isTemplate: false, date: { gte: from, lte: to } }),
    db.schoolYear.findMany({
      where: { userId: user.id },
      select: { id: true, name: true, startDate: true, endDate: true },
    }),
  ]);

  const year = yearFor(years, monday);
  const inYear = year && to >= year.startDate && from <= year.endDate;
  // Per numerare la settimana servono le vacanze di tutto l'anno, non solo di questi 7 giorni.
  const range = await loadCalendarRange(
    user.id,
    settings,
    inYear ? year.startDate : from,
    inYear ? (year.endDate > to ? year.endDate : to) : to,
  );
  const weekNumber = inYear
    ? (yearWeeks(
        year,
        range.holidays.map((h) => ({ name: h.name, startDate: h.date, endDate: h.date })),
      ).find((w) => w.monday === monday)?.number ?? null)
    : null;

  return {
    monday,
    days,
    slots: slots.map(toSlotDTO),
    exceptions: exceptions.map(toExceptionDTO),
    events: events as EventDTO[],
    external: range.external.filter((e) => e.date >= from && e.date <= to),
    holidays: range.holidays.filter((h) => h.date >= from && h.date <= to),
    plans,
    year: inYear ? year : null,
    weekNumber,
    settings: { lessonMinutes: settings.lessonMinutes, defaultHours: settings.defaultHours },
    calendarErrors: range.errors,
  };
});
