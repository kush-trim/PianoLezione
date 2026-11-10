import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { notFound, readJson, route } from "@/lib/http";
import { assertOwned, getPlan, objectiveFields, phaseRows, snapshotPlan } from "@/lib/plans";
import { planUpdateSchema } from "@/lib/validation";

type P = { id: string };

export const GET = route<P>(async (_req, { id }) => {
  const user = await requireUser();
  return getPlan(user.id, id);
});

export const PUT = route<P>(async (req, { id }) => {
  const user = await requireUser();
  const data = planUpdateSchema.parse(await readJson(req));
  const before = await getPlan(user.id, id);
  await assertOwned(user.id, { folderId: data.folderId, slotIds: data.slotIds });

  // Lo stato precedente finisce nello storico (al massimo ogni 5 minuti).
  await snapshotPlan(before);

  const {
    phases,
    slotIds,
    sezioniExtra,
    obiettivoInsegnamento,
    obiettivoApprendimento,
    obiettiviInsegnamento,
    obiettiviApprendimento,
    ...fields
  } = data;
  await db.$transaction(async (tx) => {
    await tx.lessonPlan.update({
      where: { id },
      data: {
        ...fields,
        ...objectiveFields({
          obiettivoInsegnamento,
          obiettivoApprendimento,
          obiettiviInsegnamento,
          obiettiviApprendimento,
        }),
        ...(sezioniExtra ? { sezioniExtra: JSON.stringify(sezioniExtra) } : {}),
      },
    });
    if (phases) {
      await tx.phase.deleteMany({ where: { planId: id } });
      await tx.phase.createMany({
        data: phaseRows(phases, true).map((r) => ({ ...r, planId: id })),
      });
    }
    if (slotIds) {
      await tx.planSlot.deleteMany({ where: { planId: id } });
      await tx.planSlot.createMany({
        data: [...new Set(slotIds)].map((slotId) => ({ planId: id, slotId })),
      });
    }
  });
  return getPlan(user.id, id);
});

export const DELETE = route<P>(async (_req, { id }) => {
  const user = await requireUser();
  const { count } = await db.lessonPlan.deleteMany({ where: { id, userId: user.id } });
  if (!count) throw notFound();
});
