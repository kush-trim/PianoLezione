import { requireUser } from "@/lib/auth";
import { remainingByClass, yearFor, yearWeeks } from "@/lib/calendar";
import { loadCalendarRange } from "@/lib/calendar-data";
import { db } from "@/lib/db";
import { route } from "@/lib/http";
import { mondayOf, today } from "@/lib/plan-utils";
import { listPlans, toExceptionDTO, toSlotDTO } from "@/lib/plans";
import { ensureSettings } from "@/lib/settings";
import type { EventDTO, RemainingDTO } from "@/lib/types";
import { dateParam } from "@/lib/validation";

// GET /api/classes/remaining?date=YYYY-MM-DD → per ogni classe e materia, le lezioni che restano
// da quella data (predefinita: oggi) alla fine dell'anno scolastico.
export const GET = route(async (req): Promise<RemainingDTO> => {
  const user = await requireUser();
  const raw = new URL(req.url).searchParams.get("date");
  const date = raw ? dateParam.parse(raw) : today();
  const settings = await ensureSettings(user.id);

  const years = await db.schoolYear.findMany({
    where: { userId: user.id },
    select: { id: true, name: true, startDate: true, endDate: true },
  });
  const year = yearFor(years, date);
  if (!year) return { year: null, from: date, schoolDaysLeft: 0, weeksLeft: 0, classes: [] };
  const from = date < year.startDate ? year.startDate : date;

  const [slots, exceptions, events, plans, range] = await Promise.all([
    db.timetableSlot.findMany({
      where: {
        userId: user.id,
        AND: [
          { OR: [{ validFrom: null }, { validFrom: { lte: year.endDate } }] },
          { OR: [{ validTo: null }, { validTo: { gte: year.startDate } }] },
        ],
      },
    }),
    db.lessonException.findMany({ where: { slot: { userId: user.id }, date: { gte: year.startDate, lte: year.endDate } } }),
    db.event.findMany({
      where: { userId: user.id, cancelsLessons: true, date: { gte: year.startDate, lte: year.endDate } },
      omit: { userId: true },
    }),
    listPlans(user.id, { isTemplate: false, date: { gte: from, lte: year.endDate } }),
    loadCalendarRange(user.id, settings, year.startDate, year.endDate),
  ]);

  const holidays = new Set(range.holidays.map((h) => h.date));
  const { classes, schoolDaysLeft } = remainingByClass(
    year,
    from,
    slots.map(toSlotDTO),
    exceptions.map(toExceptionDTO),
    holidays,
    events as EventDTO[],
    plans,
  );
  const weeksLeft = yearWeeks(
    year,
    range.holidays.map((h) => ({ name: h.name, startDate: h.date, endDate: h.date })),
  ).filter((w) => w.number !== null && w.monday >= mondayOf(from)).length;

  return { year, from, schoolDaysLeft, weeksLeft, classes };
});
