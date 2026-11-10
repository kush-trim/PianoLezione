import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { readJson, route } from "@/lib/http";
import { toSlotDTO } from "@/lib/plans";
import { slotSchema } from "@/lib/validation";

export const GET = route(async () => {
  const user = await requireUser();
  const slots = await db.timetableSlot.findMany({
    where: { userId: user.id },
    orderBy: [{ weekday: "asc" }, { startTime: "asc" }],
  });
  return slots.map(toSlotDTO);
});

export const POST = route(async (req) => {
  const user = await requireUser();
  const data = slotSchema.parse(await readJson(req));
  const slot = await db.timetableSlot.create({ data: { ...data, userId: user.id } });
  return toSlotDTO(slot);
});
