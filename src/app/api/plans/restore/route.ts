import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { readJson, route } from "@/lib/http";
import { assertOwned, getPlan, objectiveFields, phaseRows } from "@/lib/plans";
import { planRestoreSchema } from "@/lib/validation";

// Ricrea un piano appena eliminato (Annulla). Cartella e lezioni che non esistono più vengono lasciate vuote.
export const POST = route(async (req) => {
  const user = await requireUser();
  const data = planRestoreSchema.parse(await readJson(req));
  const folderId =
    data.folderId && (await db.folder.count({ where: { id: data.folderId, userId: user.id } })) ? data.folderId : null;
  const { slotIds: wantedSlots, exerciseIds, phases, sezioniExtra, obiettivoInsegnamento, obiettivoApprendimento, obiettiviInsegnamento, obiettiviApprendimento, ...fields } =
    data;
  const slotIds = wantedSlots?.length
    ? (await db.timetableSlot.findMany({ where: { id: { in: wantedSlots }, userId: user.id }, select: { id: true } })).map((s) => s.id)
    : [];
  await assertOwned(user.id, { folderId, slotIds });

  const validExercises = exerciseIds?.length
    ? (await db.exercise.findMany({ where: { id: { in: exerciseIds }, userId: user.id }, select: { id: true } })).map((e) => e.id)
    : [];
  const plan = await db.lessonPlan.create({
    data: {
      ...fields,
      userId: user.id,
      folderId,
      ...objectiveFields({ obiettivoInsegnamento, obiettivoApprendimento, obiettiviInsegnamento, obiettiviApprendimento }),
      sezioniExtra: JSON.stringify(sezioniExtra ?? []),
      phases: { create: phaseRows(phases ?? [], false) },
      slots: { create: slotIds.map((slotId) => ({ slotId })) },
      exercises: { create: validExercises.map((exerciseId) => ({ exerciseId })) },
    },
  });
  return getPlan(user.id, plan.id);
});
