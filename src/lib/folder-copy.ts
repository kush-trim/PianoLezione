// Copia di una cartella di esercizi (con sottocartelle e file) sul proprio Google Drive.
// Serve soprattutto per le cartelle condivise da un collega: la copia è mia e resta anche se
// lui la cancella o mi toglie l'accesso.
//
// Con il permesso "drive.file" il mio account non può leggere i file creati per un altro
// account: il contenuto si legge con l'account del proprietario e si carica con il mio.

import { db } from "./db";
import { DriveNotAuthorized, driveFor } from "./google-drive";
import { ApiError } from "./http";
import { folderAccess } from "./materials";
import { parseTags } from "./tags";
import type { FolderCopyDTO } from "./types";

export const MAX_COPY_FILES = 200;
export const MAX_COPY_BYTES = 1_000_000_000;

/** "nome", altrimenti "nome (copia)", "nome (copia 2)"… finché non è libero tra le mie cartelle principali. */
async function freeRootName(userId: string, name: string) {
  const taken = new Set(
    (await db.materialFolder.findMany({ where: { ownerId: userId, parentId: null }, select: { name: true } })).map((f) => f.name.trim().toLowerCase()),
  );
  const candidates = [name, `${name} (copia)`, ...Array.from({ length: 50 }, (_, i) => `${name} (copia ${i + 2})`)];
  return candidates.find((c) => !taken.has(c.trim().toLowerCase())) ?? `${name} (copia ${Date.now()})`;
}

/** Toglie una copia non riuscita: nel cestino di Drive (se si può) e dal sito. */
async function undo(userId: string, rootId: string, driveFolderId: string) {
  try {
    await driveFor(userId).trash(driveFolderId);
  } catch {
    // Drive non risponde: resta una cartella vuota nel mio Drive, il sito la dimentica comunque.
  }
  await db.materialFolder.delete({ where: { id: rootId } }).catch(() => {});
}

export async function copyFolderToMyDrive(userId: string, folderId: string): Promise<FolderCopyDTO> {
  const { folder } = await folderAccess(userId, folderId);

  // La cartella e tutto ciò che contiene, dall'alto verso il basso.
  const tree = await db.materialFolder.findMany({ where: { OR: [{ id: folder.rootId ?? folder.id }, { rootId: folder.rootId ?? folder.id }] } });
  const ordered = [folder];
  for (let i = 0; i < ordered.length; i++) ordered.push(...tree.filter((f) => f.parentId === ordered[i].id));
  const files = await db.exercise.findMany({
    where: { folderId: { in: ordered.map((f) => f.id) }, driveFileId: { not: null } },
    orderBy: { createdAt: "asc" },
  });
  if (files.length > MAX_COPY_FILES) {
    throw new ApiError(400, `La cartella ha ${files.length} file: se ne copiano al massimo ${MAX_COPY_FILES} alla volta. Copia le sottocartelle una per una.`);
  }
  if (files.reduce((n, f) => n + f.size, 0) > MAX_COPY_BYTES) {
    throw new ApiError(400, "La cartella supera 1 GB: copia le sottocartelle una per una.");
  }

  const mine = driveFor(userId);
  const source = driveFor(folder.ownerId);
  const owner = await db.user.findUnique({ where: { id: folder.ownerId }, select: { name: true } });
  const origin = folder.ownerId === userId ? `«${folder.name}»` : `«${folder.name}» di ${owner?.name ?? "un collega"}`;

  // Le cartelle, sul mio Drive: la principale tra le mie, poi le sottocartelle.
  const appRoot = await mine.appFolder();
  const rootName = await freeRootName(userId, folder.name);
  const created = new Map<string, { id: string; driveFolderId: string }>();
  let newRootId = "";
  for (const f of ordered) {
    const parent = f.id === folder.id ? null : created.get(f.parentId!)!;
    const name = f.id === folder.id ? rootName : f.name;
    const onDrive = await mine.createFolder(name, parent ? parent.driveFolderId : appRoot);
    const row = await db.materialFolder.create({
      data: {
        ownerId: userId,
        createdById: userId,
        name,
        driveFolderId: onDrive.id,
        parentId: parent?.id ?? null,
        rootId: parent ? newRootId : null,
      },
    });
    if (!parent) newRootId = row.id;
    created.set(f.id, { id: row.id, driveFolderId: onDrive.id });
  }

  // I file: letti con l'account del proprietario, caricati con il mio. Un file che non si
  // riesce a copiare non ferma gli altri: alla fine si dice quali mancano.
  const failed: string[] = [];
  let copied = 0;
  for (const ex of files) {
    const to = created.get(ex.folderId!)!;
    try {
      const data = await source.download(ex.driveFileId!);
      const up = await mine.upload(to.driveFolderId, ex.fileName, ex.mimeType.split(";")[0], data);
      await db.exercise.create({
        data: {
          userId,
          folderId: to.id,
          uploadedById: userId,
          title: ex.title,
          fileName: ex.fileName,
          mimeType: ex.mimeType,
          size: up.size,
          note: ex.note,
          tags: JSON.stringify(parseTags(ex.tags)),
          copiedFrom: origin,
          driveFileId: up.id,
          webViewLink: up.webViewLink,
        },
      });
      copied++;
    } catch (e) {
      // Drive non autorizzato (del proprietario o mio): inutile continuare. Si toglie la copia
      // a metà, così non restano cartelle vuote.
      if (e instanceof DriveNotAuthorized) {
        await undo(userId, newRootId, created.get(folder.id)!.driveFolderId);
        if (e.userId === folder.ownerId && folder.ownerId !== userId) {
          throw new ApiError(409, `Non si possono leggere i file: ${owner?.name ?? "il proprietario"} deve rientrare in PianoStudio con Google.`);
        }
        throw e;
      }
      console.error("copia della cartella: file non copiato", ex.id, e instanceof Error ? e.message : e);
      failed.push(ex.title);
    }
  }
  return { id: newRootId, name: rootName, folders: ordered.length, files: copied, failed };
}
