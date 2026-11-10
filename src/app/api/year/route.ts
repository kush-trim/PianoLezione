import { requireUser } from "@/lib/auth";
import { yearFor, yearWeeks } from "@/lib/calendar";
import { loadCalendarRange } from "@/lib/calendar-data";
import { db } from "@/lib/db";
import { route } from "@/lib/http";
import { addDays, mondayOf, today } from "@/lib/plan-utils";
import { ensureSettings } from "@/lib/settings";
import { dateParam } from "@/lib/validation";

// GET /api/year?date=YYYY-MM-DD → le settimane numerate dell'anno scolastico di quella data.
export const GET = route(async (req) => {
  const user = await requireUser();
  const raw = new URL(req.url).searchParams.get("date");
  const date = raw ? dateParam.parse(raw) : today();
  const settings = await ensureSettings(user.id);

  const years = await db.schoolYear.findMany({
    where: { userId: user.id },
    orderBy: { startDate: "asc" },
    select: { id: true, name: true, startDate: true, endDate: true },
  });
  const year = yearFor(years, date);
  if (!year) return { year: null, years, weeks: [] };

  const [range, plans] = await Promise.all([
    loadCalendarRange(user.id, settings, year.startDate, year.endDate),
    db.lessonPlan.findMany({
      where: { userId: user.id, isTemplate: false, date: { gte: mondayOf(year.startDate), lte: addDays(year.endDate, 7) } },
      select: { date: true },
    }),
  ]);
  const planCount = new Map<string, number>();
  for (const p of plans) {
    if (!p.date) continue;
    const m = mondayOf(p.date);
    planCount.set(m, (planCount.get(m) ?? 0) + 1);
  }
  const weeks = yearWeeks(
    year,
    range.holidays.map((h) => ({ name: h.name, startDate: h.date, endDate: h.date })),
  ).map((w) => ({ ...w, plans: planCount.get(w.monday) ?? 0 }));

  return { year, years, weeks };
});
