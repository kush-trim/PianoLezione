import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { notFound, readJson, route } from "@/lib/http";
import { addDays } from "@/lib/plan-utils";
import { slotEndSchema } from "@/lib/validation";

// Toglie una lezione ricorrente "da questa data in poi": il passato resta com'è.
export const POST = route<{ id: string }>(async (req, { id }) => {
  const user = await requireUser();
  const { from } = slotEndSchema.parse(await readJson(req));
  const slot = await db.timetableSlot.findFirst({ where: { id, userId: user.id } });
  if (!slot) throw notFound();

  // Non è mai stata valida prima di quella data: si elimina del tutto.
  if (slot.validFrom && slot.validFrom >= from) {
    await db.timetableSlot.delete({ where: { id } });
    return;
  }
  await db.$transaction([
    db.timetableSlot.update({ where: { id }, data: { validTo: addDays(from, -1) } }),
    db.lessonException.deleteMany({ where: { slotId: id, date: { gte: from } } }),
    // I piani dei giorni successivi restano, ma non sono più collegati a questa lezione.
    db.planSlot.deleteMany({ where: { slotId: id, plan: { date: { gte: from } } } }),
  ]);
});
