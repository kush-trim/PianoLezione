import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { deleteExercise, editableExercise, getExercise, moveExercise, setTags } from "@/lib/exercises";
import { readJson, route } from "@/lib/http";
import { exerciseUpdateSchema } from "@/lib/validation";

type P = { id: string };

export const GET = route<P>(async (_req, { id }) => {
  const user = await requireUser();
  return getExercise(user.id, id);
});

// Nome, nota e cartella (spostamento): solo per chi l'ha caricato o per il proprietario della cartella.
// Le etichette: chiunque veda il file.
export const PATCH = route<P>(async (req, { id }) => {
  const user = await requireUser();
  const { folderId, tags, ...data } = exerciseUpdateSchema.parse(await readJson(req));
  if (folderId || Object.keys(data).length) await editableExercise(user.id, id);
  if (tags) await setTags(user.id, id, tags);
  if (folderId) await moveExercise(user.id, id, folderId);
  if (Object.keys(data).length) await db.exercise.update({ where: { id }, data });
  return getExercise(user.id, id);
});

// Elimina l'esercizio: su Drive va nel cestino, nei piani sparisce il collegamento.
export const DELETE = route<P>(async (_req, { id }) => {
  const user = await requireUser();
  await deleteExercise(user.id, id);
});
