// Esercizi (file: PDF, Word, Excel…) lato server.

import { db } from "./db";
import { EXERCISE_EXTENSIONS, fileTypeOf } from "./file-types";
import { ApiError, notFound } from "./http";
import type { ExerciseDTO } from "./types";

export const MAX_EXERCISE_BYTES = 15_000_000;

const include = {
  plans: {
    include: { plan: { select: { id: true, title: true, date: true } } },
    orderBy: { createdAt: "asc" },
  },
} as const;

type Row = {
  id: string;
  title: string;
  fileName: string;
  size: number;
  note: string;
  createdAt: Date;
  plans: { plan: { id: string; title: string; date: string | null } }[];
};

export const toExerciseDTO = (e: Row): ExerciseDTO => ({
  id: e.id,
  title: e.title,
  fileName: e.fileName,
  size: e.size,
  note: e.note,
  createdAt: e.createdAt.toISOString(),
  plans: e.plans.map((p) => p.plan),
});

export async function listExercises(userId: string, q?: string): Promise<ExerciseDTO[]> {
  const rows = await db.exercise.findMany({
    where: { userId, ...(q ? { OR: [{ title: { contains: q } }, { fileName: { contains: q } }] } : {}) },
    orderBy: { createdAt: "desc" },
    include,
  });
  return rows.map(toExerciseDTO);
}

export async function getExercise(userId: string, id: string): Promise<ExerciseDTO> {
  const row = await db.exercise.findFirst({ where: { id, userId }, include });
  if (!row) throw notFound();
  return toExerciseDTO(row);
}

/** Salva un file caricato; con planId lo collega subito a quel piano. */
export async function createExercise(userId: string, file: File, title: string, planId?: string | null) {
  const type = fileTypeOf(file.name);
  if (!type) {
    throw new ApiError(400, `"${file.name}": tipo di file non ammesso (ammessi: ${EXERCISE_EXTENSIONS.join(", ")})`);
  }
  if (file.size > MAX_EXERCISE_BYTES) throw new ApiError(400, `"${file.name}" è troppo grande (massimo 15 MB)`);
  const data = new Uint8Array(await file.arrayBuffer());
  // Un "PDF" deve iniziare con "%PDF".
  if (type.kind === "pdf" && (data[0] !== 0x25 || data[1] !== 0x50 || data[2] !== 0x44 || data[3] !== 0x46)) {
    throw new ApiError(400, `"${file.name}" non è un PDF valido`);
  }
  if (planId && !(await db.lessonPlan.count({ where: { id: planId, userId } }))) throw new ApiError(400, "Piano non valido");
  const name = file.name.slice(0, 200);
  const created = await db.exercise.create({
    data: {
      userId,
      title: (title.trim() || name.replace(/\.[a-z0-9]+$/i, "")).slice(0, 200),
      fileName: name,
      mimeType: type.mime,
      size: data.byteLength,
      file: { create: { data } },
      ...(planId ? { plans: { create: { planId } } } : {}),
    },
  });
  return getExercise(userId, created.id);
}
