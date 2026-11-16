// Esercizi lato server. Il file si carica dal sito ma finisce su Google Drive, nella cartella
// di esercizi scelta (sul Drive del suo proprietario). Nel database: nome, tipo, dimensione, link.
// I file caricati sul sito prima di Drive (senza cartella, in ExerciseFile) restano leggibili
// finché il proprietario non accede con Google: a quel punto vengono spostati su Drive.

import { db } from "./db";
import { EXERCISE_EXTENSIONS, fileTypeOf } from "./file-types";
import { driveFor } from "./google-drive";
import { ApiError, notFound } from "./http";
import { accessibleExercises, ensureDefaultFolder, folderAccess } from "./materials";
import { normalizeTags, parseTags, sortTags, tagKey } from "./tags";
import type { ExerciseDTO, ExerciseRef, TagCountDTO } from "./types";

export const MAX_EXERCISE_BYTES = 15_000_000;

export const exerciseRefSelect = {
  id: true,
  title: true,
  fileName: true,
  size: true,
  folderId: true,
  webViewLink: true,
  tags: true,
  folder: { select: { name: true } },
} as const;

type RefRow = {
  id: string;
  title: string;
  fileName: string;
  size: number;
  folderId: string | null;
  webViewLink: string | null;
  tags: string;
  folder: { name: string } | null;
};

export const toExerciseRef = (e: RefRow): ExerciseRef => ({
  id: e.id,
  title: e.title,
  fileName: e.fileName,
  size: e.size,
  url: e.webViewLink ?? `/api/exercises/${e.id}/file`,
  source: e.webViewLink ? "drive" : "upload",
  folderId: e.folderId,
  folderName: e.folder?.name ?? null,
  tags: sortTags(parseTags(e.tags)),
});

const select = (viewerId: string) =>
  ({
    ...exerciseRefSelect,
    userId: true,
    note: true,
    createdAt: true,
    mimeType: true,
    copiedFrom: true,
    user: { select: { id: true, name: true } },
    uploadedBy: { select: { id: true, name: true } },
    // Solo i piani di chi guarda: i piani dei colleghi restano privati.
    plans: {
      where: { plan: { userId: viewerId } },
      include: { plan: { select: { id: true, title: true, date: true } } },
      orderBy: { createdAt: "asc" },
    },
  }) as const;

type Row = RefRow & {
  userId: string;
  note: string;
  createdAt: Date;
  mimeType: string;
  copiedFrom: string | null;
  user: { id: string; name: string };
  uploadedBy: { id: string; name: string } | null;
  plans: { plan: { id: string; title: string; date: string | null } }[];
};

const toDTO = (viewerId: string, e: Row): ExerciseDTO => ({
  ...toExerciseRef(e),
  note: e.note,
  createdAt: e.createdAt.toISOString(),
  mimeType: e.mimeType,
  uploadedBy: e.uploadedBy,
  owner: e.user,
  copiedFrom: e.copiedFrom,
  // Il proprietario della cartella (userId) o chi l'ha caricato.
  canEdit: e.userId === viewerId || e.uploadedBy?.id === viewerId,
  plans: e.plans.map((p) => p.plan),
});

export async function listExercises(userId: string, opts: { q?: string; folderId?: string; tag?: string } = {}): Promise<ExerciseDTO[]> {
  if (opts.folderId) await folderAccess(userId, opts.folderId);
  const rows = await db.exercise.findMany({
    where: {
      AND: [
        accessibleExercises(userId),
        opts.folderId ? { folderId: opts.folderId } : {},
        opts.q
          ? { OR: [{ title: { contains: opts.q } }, { fileName: { contains: opts.q } }, { note: { contains: opts.q } }, { tags: { contains: opts.q } }] }
          : {},
        // Prima scrematura nel database; il controllo esatto si fa qui sotto.
        opts.tag ? { tags: { contains: opts.tag } } : {},
      ],
    },
    orderBy: { createdAt: "desc" },
    select: select(userId),
  });
  const out = rows.map((r) => toDTO(userId, r));
  return opts.tag ? out.filter((e) => e.tags.some((t) => tagKey(t) === tagKey(opts.tag!))) : out;
}

/** Le etichette usate negli esercizi che l'utente vede, con quanti file le hanno. */
export async function tagCounts(userId: string): Promise<TagCountDTO[]> {
  const rows = await db.exercise.findMany({ where: { AND: [accessibleExercises(userId), { NOT: { tags: "[]" } }] }, select: { tags: true } });
  const counts = new Map<string, { tag: string; count: number }>();
  for (const r of rows) {
    for (const t of parseTags(r.tags)) {
      const c = counts.get(tagKey(t)) ?? { tag: t, count: 0 };
      c.count++;
      counts.set(tagKey(t), c);
    }
  }
  const sorted = sortTags([...counts.values()].map((c) => c.tag));
  return sorted.map((t) => counts.get(tagKey(t))!);
}

/**
 * Cambia le etichette. Le può mettere chiunque veda il file (anche un collega in una cartella
 * condivisa, che su Drive ha comunque il permesso di modifica); titolo e nota no.
 */
export async function setTags(userId: string, id: string, tags: string[]) {
  await getExercise(userId, id);
  await db.exercise.update({ where: { id }, data: { tags: JSON.stringify(normalizeTags(tags)) } });
}

export async function getExercise(userId: string, id: string): Promise<ExerciseDTO> {
  const row = await db.exercise.findFirst({ where: { AND: [{ id }, accessibleExercises(userId)] }, select: select(userId) });
  if (!row) throw notFound();
  return toDTO(userId, row);
}

/** L'esercizio, se l'utente può modificarlo (proprietario della cartella o chi l'ha caricato). */
export async function editableExercise(userId: string, id: string) {
  const ex = await getExercise(userId, id);
  if (!ex.canEdit) throw new ApiError(403, "Solo chi l'ha caricato o il proprietario della cartella può modificarlo");
  return ex;
}

/** Controlla tipo e dimensione di un file caricato. */
async function readUpload(file: File): Promise<{ data: Uint8Array; mime: string; name: string }> {
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
  return { data, mime: type.mime.split(";")[0], name: file.name.slice(0, 200) };
}

/**
 * Carica i file su Google Drive, nella cartella indicata (o in "I miei esercizi").
 * In una cartella condivisa il file va sul Drive del proprietario della cartella.
 */
export async function uploadExercises(
  userId: string,
  files: File[],
  opts: { folderId?: string | null; title?: string; planId?: string | null; tags?: string[] },
): Promise<ExerciseDTO[]> {
  const folder = opts.folderId ? (await folderAccess(userId, opts.folderId)).folder : await ensureDefaultFolder(userId);
  if (opts.planId && !(await db.lessonPlan.count({ where: { id: opts.planId, userId } }))) throw new ApiError(400, "Piano non valido");

  // Prima si controllano tutti i file: o partono tutti, o nessuno.
  const checked = await Promise.all(files.map(readUpload));
  const drive = driveFor(folder.ownerId);
  const out: ExerciseDTO[] = [];
  for (const f of checked) {
    const uploaded = await drive.upload(folder.driveFolderId, f.name, f.mime, f.data);
    const title = (files.length === 1 && opts.title?.trim()) || f.name.replace(/\.[a-z0-9]+$/i, "");
    const created = await db.exercise.create({
      data: {
        userId: folder.ownerId,
        folderId: folder.id,
        uploadedById: userId,
        title: title.slice(0, 200),
        fileName: f.name,
        mimeType: f.mime,
        size: uploaded.size,
        driveFileId: uploaded.id,
        webViewLink: uploaded.webViewLink,
        tags: JSON.stringify(normalizeTags(opts.tags ?? [])),
        ...(opts.planId ? { plans: { create: { planId: opts.planId } } } : {}),
      },
      select: { id: true },
    });
    out.push(await getExercise(userId, created.id));
  }
  return out;
}

/**
 * Sposta un file in un'altra cartella dello stesso Drive (stesso proprietario).
 * Chi non vede la nuova cartella perde il file anche dai suoi piani.
 */
export async function moveExercise(userId: string, id: string, folderId: string) {
  await editableExercise(userId, id);
  const ex = await db.exercise.findUniqueOrThrow({ where: { id }, include: { folder: true } });
  const { folder: target } = await folderAccess(userId, folderId);
  if (ex.folderId === target.id) return;
  if (!ex.folder || !ex.driveFileId) throw new ApiError(400, "Questo file non è ancora su Google Drive");
  if (target.ownerId !== ex.folder.ownerId) {
    throw new ApiError(400, "Un file si sposta solo tra cartelle dello stesso Google Drive (dello stesso proprietario)");
  }
  await driveFor(target.ownerId).move(ex.driveFileId, ex.folder.driveFolderId, target.driveFolderId);
  const rootId = target.rootId ?? target.id;
  const members = await db.materialFolderMember.findMany({ where: { folderId: rootId }, select: { userId: true } });
  const allowed = [target.ownerId, ...members.map((m) => m.userId)];
  await db.$transaction([
    db.exercise.update({ where: { id }, data: { folderId: target.id } }),
    db.planExercise.deleteMany({ where: { exerciseId: id, plan: { userId: { notIn: allowed } } } }),
  ]);
}

/** Elimina: su Drive il file va nel cestino (recuperabile per 30 giorni). */
export async function deleteExercise(userId: string, id: string) {
  await editableExercise(userId, id);
  const ex = await db.exercise.findUniqueOrThrow({ where: { id }, include: { folder: true } });
  if (ex.driveFileId && ex.folder) {
    try {
      await driveFor(ex.folder.ownerId).trash(ex.driveFileId);
    } catch (e) {
      if (!(e instanceof ApiError && e.status === 404)) throw e; // già tolto su Drive
    }
  }
  await db.exercise.delete({ where: { id } });
}

/**
 * Sposta su Drive ("I miei esercizi") i file caricati sul sito prima di Drive.
 * Si fa al primo accesso con Google; se Drive non risponde si riprova all'accesso successivo.
 */
export async function migrateLegacyExercises(userId: string): Promise<number> {
  const legacy = await db.exercise.findMany({ where: { userId, folderId: null }, include: { file: true } });
  if (!legacy.length) return 0;
  const folder = await ensureDefaultFolder(userId);
  const drive = driveFor(userId);
  let moved = 0;
  for (const ex of legacy) {
    if (!ex.file) continue;
    const uploaded = await drive.upload(folder.driveFolderId, ex.fileName, ex.mimeType.split(";")[0], new Uint8Array(ex.file.data));
    await db.$transaction([
      db.exercise.update({
        where: { id: ex.id },
        data: { folderId: folder.id, driveFileId: uploaded.id, webViewLink: uploaded.webViewLink, uploadedById: userId, size: uploaded.size },
      }),
      db.exerciseFile.delete({ where: { exerciseId: ex.id } }),
    ]);
    moved++;
  }
  return moved;
}
