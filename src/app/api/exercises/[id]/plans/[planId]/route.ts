import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { getExercise } from "@/lib/exercises";
import { ApiError, route } from "@/lib/http";
import { accessibleExercises } from "@/lib/materials";

type P = { id: string; planId: string };

// L'esercizio deve essere visibile all'utente (anche da una cartella condivisa), il piano suo.
async function assertBoth(userId: string, id: string, planId: string) {
  const [e, p] = await Promise.all([
    db.exercise.count({ where: { AND: [{ id }, accessibleExercises(userId)] } }),
    db.lessonPlan.count({ where: { id: planId, userId } }),
  ]);
  if (!e || !p) throw new ApiError(404, "Non trovato");
}

// POST → collega l'esercizio al piano; DELETE → toglie il collegamento (il file resta).
export const POST = route<P>(async (_req, { id, planId }) => {
  const user = await requireUser();
  await assertBoth(user.id, id, planId);
  await db.planExercise.upsert({
    where: { planId_exerciseId: { planId, exerciseId: id } },
    create: { planId, exerciseId: id },
    update: {},
  });
  return getExercise(user.id, id);
});

export const DELETE = route<P>(async (_req, { id, planId }) => {
  const user = await requireUser();
  await assertBoth(user.id, id, planId);
  await db.planExercise.deleteMany({ where: { planId, exerciseId: id } });
  return getExercise(user.id, id);
});
