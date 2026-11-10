import { requireUser } from "@/lib/auth";
import { occurrencesOn } from "@/lib/calendar";
import { db } from "@/lib/db";
import { readJson, route } from "@/lib/http";
import { toExceptionDTO, toSlotDTO } from "@/lib/plans";
import { dateParam, slotSchema } from "@/lib/validation";

// GET /api/timetable            → tutte le lezioni ricorrenti
// GET /api/timetable?date=...   → le lezioni di quel giorno, con le modifiche di quel giorno applicate
export const GET = route(async (req) => {
  const user = await requireUser();
  const rawDate = new URL(req.url).searchParams.get("date");
  const slots = await db.timetableSlot.findMany({
    where: { userId: user.id },
    orderBy: [{ weekday: "asc" }, { startTime: "asc" }],
  });
  if (!rawDate) return slots.map(toSlotDTO);

  const date = dateParam.parse(rawDate);
  const exceptions = await db.lessonException.findMany({ where: { date, slot: { userId: user.id } } });
  return occurrencesOn(date, slots.map(toSlotDTO), exceptions.map(toExceptionDTO));
});

export const POST = route(async (req) => {
  const user = await requireUser();
  const data = slotSchema.parse(await readJson(req));
  const slot = await db.timetableSlot.create({ data: { ...data, userId: user.id } });
  return toSlotDTO(slot);
});
