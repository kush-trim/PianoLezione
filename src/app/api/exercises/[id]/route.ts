import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { getExercise } from "@/lib/exercises";
import { notFound, readJson, route } from "@/lib/http";
import { exerciseUpdateSchema } from "@/lib/validation";

type P = { id: string };

export const GET = route<P>(async (_req, { id }) => {
  const user = await requireUser();
  return getExercise(user.id, id);
});

export const PATCH = route<P>(async (req, { id }) => {
  const user = await requireUser();
  const data = exerciseUpdateSchema.parse(await readJson(req));
  const { count } = await db.exercise.updateMany({ where: { id, userId: user.id }, data });
  if (!count) throw notFound();
  return getExercise(user.id, id);
});

// Elimina l'esercizio: i piani restano, senza quel collegamento.
export const DELETE = route<P>(async (_req, { id }) => {
  const user = await requireUser();
  const { count } = await db.exercise.deleteMany({ where: { id, userId: user.id } });
  if (!count) throw notFound();
});
