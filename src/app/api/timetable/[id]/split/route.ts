import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { notFound, readJson, route } from "@/lib/http";
import { addDays } from "@/lib/plan-utils";
import { toSlotDTO } from "@/lib/plans";
import { slotSplitSchema } from "@/lib/validation";

// Modifica una lezione ricorrente "da questa data in poi": la lezione attuale finisce
// il giorno prima e ne nasce una nuova. Piani e modifiche dei giorni successivi la seguono.
export const POST = route<{ id: string }>(async (req, { id }) => {
  const user = await requireUser();
  const { from, slot: data } = slotSplitSchema.parse(await readJson(req));
  const old = await db.timetableSlot.findFirst({ where: { id, userId: user.id } });
  if (!old) throw notFound();

  // La lezione inizia già da quella data (o dopo): basta modificarla.
  if (old.validFrom && old.validFrom >= from) {
    const updated = await db.timetableSlot.update({
      where: { id },
      data: { ...data, validFrom: old.validFrom, validTo: old.validTo },
    });
    return toSlotDTO(updated);
  }

  const created = await db.$transaction(async (tx) => {
    const next = await tx.timetableSlot.create({
      data: { ...data, userId: user.id, validFrom: from, validTo: old.validTo },
    });
    await tx.timetableSlot.update({ where: { id }, data: { validTo: addDays(from, -1) } });

    const futurePlans = await tx.planSlot.findMany({
      where: { slotId: id, plan: { date: { gte: from } } },
      select: { planId: true },
    });
    if (futurePlans.length) {
      await tx.planSlot.deleteMany({ where: { slotId: id, planId: { in: futurePlans.map((p) => p.planId) } } });
      await tx.planSlot.createMany({ data: futurePlans.map((p) => ({ planId: p.planId, slotId: next.id })) });
    }
    // Le modifiche di singoli giorni futuri valevano per gli orari vecchi: si tolgono.
    await tx.lessonException.deleteMany({ where: { slotId: id, date: { gte: from } } });
    return next;
  });
  return toSlotDTO(created);
});
