import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { route } from "@/lib/http";
import { addDays, mondayOf, today } from "@/lib/plan-utils";
import { listPlans, toSlotDTO } from "@/lib/plans";
import { dateParam } from "@/lib/validation";

// GET /api/week?date=YYYY-MM-DD → orario e piani della settimana che contiene la data.
export const GET = route(async (req) => {
  const user = await requireUser();
  const raw = new URL(req.url).searchParams.get("date");
  const monday = mondayOf(raw ? dateParam.parse(raw) : today());
  const days = Array.from({ length: 7 }, (_, i) => addDays(monday, i));

  const [slots, plans] = await Promise.all([
    db.timetableSlot.findMany({
      where: { userId: user.id },
      orderBy: [{ weekday: "asc" }, { startTime: "asc" }],
    }),
    listPlans(user.id, { isTemplate: false, date: { gte: days[0], lte: days[6] } }),
  ]);
  return { monday, days, slots: slots.map(toSlotDTO), plans };
});
