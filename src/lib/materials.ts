// Cartelle di esercizi su Google Drive: accesso, sottocartelle, condivisione, inviti, notifiche.
// Ogni cartella è una cartella sul Drive del proprietario; le operazioni su Drive
// si fanno sempre con il suo account (permesso "drive.file": l'app vede solo ciò che ha creato).
// Si condivide la cartella principale: i suoi membri vedono anche tutte le sottocartelle.

import { db } from "./db";
import { googleEmailOf } from "./google-account";
import { DriveNotAuthorized, driveFor } from "./google-drive";
import { ApiError, notFound } from "./http";
import type { FoldersDTO, InviteDTO, MaterialFolderDTO, NotificationDTO, NotificationsDTO, StorageDTO } from "./types";

export const DEFAULT_FOLDER_NAME = "I miei file";
/** Il nome di prima: le cartelle personali nate con questo nome vengono rinominate. */
const OLD_DEFAULT_FOLDER_NAME = "I miei esercizi";

// --- Accesso ---

/** Condizione Prisma: le cartelle che l'utente vede (sue, o dentro una principale di cui è membro). */
const visibleFolders = (userId: string) => ({
  OR: [{ ownerId: userId }, { members: { some: { userId } } }, { root: { members: { some: { userId } } } }],
});

/** La cartella, se l'utente ne è proprietario o membro (anche tramite la principale); altrimenti 404. */
export async function folderAccess(userId: string, folderId: string) {
  const folder = await db.materialFolder.findFirst({ where: { id: folderId, ...visibleFolders(userId) } });
  if (!folder) throw notFound();
  return { folder, role: folder.ownerId === userId ? ("owner" as const) : ("member" as const) };
}

/** Condizione Prisma: gli esercizi che l'utente può vedere. */
export const accessibleExercises = (userId: string) => ({
  OR: [
    // File caricati sul sito prima di Drive.
    { folderId: null, userId },
    { folder: visibleFolders(userId) },
  ],
});

type FolderRow = { ownerId: string; rootId: string | null; createdById: string | null };

/** Rinominare ed eliminare: il proprietario, o un membro per le sottocartelle che ha creato lui. */
const canManage = (userId: string, f: FolderRow) => f.ownerId === userId || (!!f.rootId && f.createdById === userId);

async function assertOwner(userId: string, folderId: string) {
  const access = await folderAccess(userId, folderId);
  if (access.role !== "owner") throw new ApiError(403, "Solo chi ha creato la cartella può farlo");
  return access.folder;
}

/** Si condivide solo la cartella principale: le sottocartelle seguono. */
async function assertRoot(folder: { rootId: string | null }) {
  if (!folder.rootId) return;
  const root = await db.materialFolder.findUnique({ where: { id: folder.rootId }, select: { name: true } });
  throw new ApiError(400, `Le sottocartelle seguono la condivisione di «${root?.name ?? "cartella principale"}»: condividi quella.`);
}

/** Due cartelle con lo stesso nome nello stesso posto confondono: non si possono avere. */
async function assertFreeName(name: string, where: { ownerId: string; parentId: string | null }, exceptId?: string) {
  const same = await db.materialFolder.findMany({ where: { ...where, ...(exceptId ? { id: { not: exceptId } } : {}) }, select: { name: true } });
  const lower = name.trim().toLowerCase();
  if (same.some((f) => f.name.trim().toLowerCase() === lower)) throw new ApiError(409, `C'è già una cartella «${name}» qui`);
}

// --- Cartelle ---

/** "I miei file": creata la prima volta che serve (sul Drive dell'utente). */
export async function ensureDefaultFolder(userId: string) {
  const existing = await db.materialFolder.findFirst({ where: { ownerId: userId, isDefault: true } });
  if (existing?.name === OLD_DEFAULT_FOLDER_NAME) {
    // La sezione Esercizi è diventata File: anche la cartella personale cambia nome, su Drive e qui.
    // Se Drive non risponde si riprova la prossima volta; intanto va bene il nome vecchio.
    try {
      await driveFor(userId).rename(existing.driveFolderId, DEFAULT_FOLDER_NAME);
      return await db.materialFolder.update({ where: { id: existing.id }, data: { name: DEFAULT_FOLDER_NAME } });
    } catch {
      return existing;
    }
  }
  if (existing) return existing;
  const drive = driveFor(userId);
  const root = await drive.appFolder();
  const created = await drive.createFolder(DEFAULT_FOLDER_NAME, root);
  return db.materialFolder.create({
    data: { ownerId: userId, name: DEFAULT_FOLDER_NAME, driveFolderId: created.id, isDefault: true },
  });
}

const driveFolderUrl = (id: string) => `https://drive.google.com/drive/folders/${id}`;

export async function listFolders(userId: string): Promise<FoldersDTO> {
  let driveAuthorized = true;
  try {
    await ensureDefaultFolder(userId);
  } catch (e) {
    if (!(e instanceof DriveNotAuthorized)) throw e;
    driveAuthorized = false;
  }
  const person = { select: { id: true, name: true, email: true } } as const;
  const rows = await db.materialFolder.findMany({
    where: visibleFolders(userId),
    include: {
      owner: person,
      createdBy: person,
      members: { include: { user: person }, orderBy: { joinedAt: "asc" } },
      invites: { where: { status: "pending" }, orderBy: { createdAt: "asc" } },
    },
  });
  // Quanti file, quanto occupano e l'ultimo aggiunto, cartella per cartella.
  const stats = new Map(
    (
      await db.exercise.groupBy({
        by: ["folderId"],
        where: { folderId: { in: rows.map((f) => f.id) } },
        _count: { _all: true },
        _sum: { size: true },
        _max: { createdAt: true },
      })
    ).map((g) => [g.folderId, g]),
  );
  const folders = rows.map((f): MaterialFolderDTO => {
    const st = stats.get(f.id);
    return {
      id: f.id,
      name: f.name,
      isDefault: f.isDefault,
      parentId: f.parentId,
      rootId: f.rootId,
      role: f.ownerId === userId ? "owner" : "member",
      owner: f.owner,
      // Le cartelle principali nate prima delle sottocartelle non hanno createdBy: è il proprietario.
      createdBy: f.createdBy ?? (f.rootId ? null : f.owner),
      createdAt: f.createdAt.toISOString(),
      canManage: canManage(userId, f),
      members: f.members.map((m) => ({ ...m.user, joinedAt: m.joinedAt.toISOString() })),
      invites: f.ownerId === userId ? f.invites.map((i) => ({ id: i.id, email: i.email, createdAt: i.createdAt.toISOString() })) : [],
      fileCount: st?._count._all ?? 0,
      bytes: st?._sum.size ?? 0,
      lastFileAt: st?._max.createdAt?.toISOString() ?? null,
      driveUrl: driveFolderUrl(f.driveFolderId),
    };
  });
  // Prima la cartella personale, poi le mie, poi quelle condivise con me; in ordine di nome.
  folders.sort(
    (a, b) =>
      Number(b.isDefault && b.role === "owner") - Number(a.isDefault && a.role === "owner") ||
      Number(a.role === "member") - Number(b.role === "member") ||
      a.name.localeCompare(b.name, "it"),
  );
  return { folders, driveAuthorized };
}

/**
 * Nuova cartella. Senza parentId è una cartella principale sul mio Drive; con parentId è una
 * sottocartella, sul Drive del proprietario della principale (anche se la crea un membro).
 */
export async function createFolder(userId: string, name: string, parentId?: string | null) {
  if (!parentId) {
    await assertFreeName(name, { ownerId: userId, parentId: null });
    const drive = driveFor(userId);
    const root = await drive.appFolder();
    const created = await drive.createFolder(name, root);
    return db.materialFolder.create({ data: { ownerId: userId, name, driveFolderId: created.id, createdById: userId } });
  }
  const { folder: parent } = await folderAccess(userId, parentId);
  await assertFreeName(name, { ownerId: parent.ownerId, parentId: parent.id });
  const created = await driveFor(parent.ownerId).createFolder(name, parent.driveFolderId);
  return db.materialFolder.create({
    data: {
      ownerId: parent.ownerId,
      name,
      driveFolderId: created.id,
      parentId: parent.id,
      rootId: parent.rootId ?? parent.id,
      createdById: userId,
    },
  });
}

async function manageableFolder(userId: string, folderId: string) {
  const { folder } = await folderAccess(userId, folderId);
  if (!canManage(userId, folder)) {
    throw new ApiError(403, "Solo il proprietario della cartella (o chi ha creato questa sottocartella) può farlo");
  }
  return folder;
}

export async function renameFolder(userId: string, folderId: string, name: string) {
  const folder = await manageableFolder(userId, folderId);
  await assertFreeName(name, { ownerId: folder.ownerId, parentId: folder.parentId }, folder.id);
  await driveFor(folder.ownerId).rename(folder.driveFolderId, name);
  await db.materialFolder.update({ where: { id: folderId }, data: { name } });
}

/**
 * Elimina la cartella con le sottocartelle e i file: su Drive va nel cestino,
 * nel sito sparisce per tutti. Una principale condivisa avvisa i membri.
 */
export async function deleteFolder(userId: string, folderId: string) {
  const folder = await manageableFolder(userId, folderId);
  if (folder.isDefault) throw new ApiError(400, `"${DEFAULT_FOLDER_NAME}" non si può eliminare`);
  try {
    await driveFor(folder.ownerId).trash(folder.driveFolderId);
  } catch (e) {
    if (!(e instanceof ApiError && e.status === 404)) throw e; // già tolta su Drive
  }
  if (folder.rootId) {
    await db.materialFolder.delete({ where: { id: folderId } });
    return;
  }
  const members = await db.materialFolderMember.findMany({ where: { folderId }, select: { userId: true } });
  const owner = await db.user.findUnique({ where: { id: userId }, select: { name: true } });
  await db.$transaction([
    ...members.map((m) =>
      db.notification.create({
        data: { userId: m.userId, type: "folder_deleted", data: JSON.stringify({ folder: folder.name, by: owner?.name ?? "" }) },
      }),
    ),
    db.materialFolder.delete({ where: { id: folderId } }),
  ]);
}

// --- Inviti ---

export async function invite(userId: string, folderId: string, rawEmail: string) {
  const folder = await assertOwner(userId, folderId);
  await assertRoot(folder);
  const email = rawEmail.trim().toLowerCase();
  if (email === (await googleEmailOf(userId))) throw new ApiError(400, "Non puoi invitare te stesso");
  const members = await db.materialFolderMember.findMany({
    where: { folderId },
    include: { user: { select: { email: true, googleAccount: { select: { email: true } } } } },
  });
  if (members.some((m) => (m.user.googleAccount?.email ?? m.user.email).toLowerCase() === email)) {
    throw new ApiError(409, "Questa persona ha già accesso alla cartella");
  }
  if (await db.folderInvite.count({ where: { folderId, email, status: "pending" } })) {
    throw new ApiError(409, "C'è già un invito in attesa per questa email");
  }
  const created = await db.folderInvite.create({ data: { folderId: folder.id, inviterId: userId, email } });
  return { id: created.id, email, createdAt: created.createdAt.toISOString() };
}

export async function revokeInvite(userId: string, folderId: string, inviteId: string) {
  await assertOwner(userId, folderId);
  const { count } = await db.folderInvite.updateMany({
    where: { id: inviteId, folderId, status: "pending" },
    data: { status: "revoked", respondedAt: new Date() },
  });
  if (!count) throw notFound();
}

/** L'invito in attesa indirizzato all'utente (alla sua email Google); altrimenti 404. */
async function myInvite(userId: string, inviteId: string) {
  const email = await googleEmailOf(userId);
  const inv = await db.folderInvite.findFirst({
    where: { id: inviteId, status: "pending" },
    include: { folder: true, inviter: { select: { name: true } } },
  });
  // Un invito per un'altra email è come se non esistesse.
  if (!inv || !email || inv.email !== email) throw notFound();
  return { inv, email };
}

export async function acceptInvite(userId: string, inviteId: string) {
  const { inv, email } = await myInvite(userId, inviteId);
  if (inv.folder.ownerId === userId) throw new ApiError(400, "La cartella è già tua");
  // La condivisione su Drive la fa il proprietario (la cartella è sul suo Drive).
  const permissionId = await driveFor(inv.folder.ownerId).share(inv.folder.driveFolderId, email);
  const me = await db.user.findUnique({ where: { id: userId }, select: { name: true } });
  await db.$transaction([
    db.materialFolderMember.upsert({
      where: { folderId_userId: { folderId: inv.folderId, userId } },
      create: { folderId: inv.folderId, userId, drivePermissionId: permissionId },
      update: { drivePermissionId: permissionId },
    }),
    db.folderInvite.update({ where: { id: inv.id }, data: { status: "accepted", respondedAt: new Date() } }),
    db.notification.create({
      data: { userId: inv.folder.ownerId, type: "invite_accepted", data: JSON.stringify({ folder: inv.folder.name, by: me?.name ?? email }) },
    }),
  ]);
  return { folderId: inv.folderId };
}

export async function declineInvite(userId: string, inviteId: string) {
  const { inv, email } = await myInvite(userId, inviteId);
  const me = await db.user.findUnique({ where: { id: userId }, select: { name: true } });
  await db.$transaction([
    db.folderInvite.update({ where: { id: inv.id }, data: { status: "declined", respondedAt: new Date() } }),
    db.notification.create({
      data: { userId: inv.folder.ownerId, type: "invite_declined", data: JSON.stringify({ folder: inv.folder.name, by: me?.name ?? email }) },
    }),
  ]);
}

/**
 * Toglie un membro: lo fa il proprietario, oppure il membro stesso (esce dalla cartella).
 * Su Drive la condivisione viene tolta; i file restano, ma spariscono dai piani del membro.
 */
export async function removeMember(actorId: string, folderId: string, memberId: string) {
  const { folder, role } = await folderAccess(actorId, folderId);
  await assertRoot(folder);
  const leaving = actorId === memberId;
  if (!leaving && role !== "owner") throw new ApiError(403, "Solo chi ha creato la cartella può togliere qualcuno");
  if (leaving && role === "owner") throw new ApiError(400, "Sei il proprietario: puoi eliminare la cartella, non uscirne");
  const member = await db.materialFolderMember.findUnique({ where: { folderId_userId: { folderId, userId: memberId } } });
  if (!member) throw notFound();

  try {
    await driveFor(folder.ownerId).unshare(folder.driveFolderId, member.drivePermissionId);
  } catch (e) {
    // Se il proprietario non ha più Drive autorizzato, il membro esce comunque dal sito.
    if (!(e instanceof DriveNotAuthorized)) throw e;
  }
  const actor = await db.user.findUnique({ where: { id: actorId }, select: { name: true } });
  await db.$transaction([
    // Anche i file delle sottocartelle.
    db.planExercise.deleteMany({
      where: { plan: { userId: memberId }, exercise: { folder: { OR: [{ id: folderId }, { rootId: folderId }] } } },
    }),
    db.materialFolderMember.delete({ where: { folderId_userId: { folderId, userId: memberId } } }),
    db.notification.create({
      data: leaving
        ? { userId: folder.ownerId, type: "member_left", data: JSON.stringify({ folder: folder.name, by: actor?.name ?? "" }) }
        : { userId: memberId, type: "member_removed", data: JSON.stringify({ folder: folder.name, by: actor?.name ?? "" }) },
    }),
  ]);
}

// --- Spazio ---

/**
 * Quanto occupano i file di PianoStudio sul mio Drive (anche quelli caricati dai colleghi
 * nelle mie cartelle) e lo spazio del Drive intero, se Google risponde.
 */
export async function storage(userId: string): Promise<StorageDTO> {
  const agg = await db.exercise.aggregate({
    where: { userId, folderId: { not: null } },
    _count: { _all: true },
    _sum: { size: true },
  });
  let drive: StorageDTO["drive"] = null;
  try {
    drive = await driveFor(userId).quota();
  } catch (e) {
    if (!(e instanceof ApiError)) throw e; // Drive non autorizzato o non raggiungibile: si mostra il resto
  }
  return { files: agg._count._all, bytes: agg._sum.size ?? 0, drive };
}

// --- Notifiche ---

const TEXT: Record<string, (d: { folder?: string; by?: string }) => string> = {
  invite_accepted: (d) => `${d.by} ha accettato l'invito alla cartella «${d.folder}».`,
  invite_declined: (d) => `${d.by} ha rifiutato l'invito alla cartella «${d.folder}».`,
  member_left: (d) => `${d.by} è uscito dalla cartella «${d.folder}».`,
  member_removed: (d) => `${d.by} ti ha tolto dalla cartella «${d.folder}». I suoi file non sono più collegati ai tuoi piani.`,
  folder_deleted: (d) => `${d.by} ha eliminato la cartella condivisa «${d.folder}».`,
};

export async function notifications(userId: string): Promise<NotificationsDTO> {
  const email = await googleEmailOf(userId);
  const [invites, rows] = await Promise.all([
    email
      ? db.folderInvite.findMany({
          where: { email, status: "pending", folder: { ownerId: { not: userId } } },
          include: { folder: { select: { name: true } }, inviter: { select: { id: true, name: true, email: true } } },
          orderBy: { createdAt: "desc" },
        })
      : [],
    db.notification.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 50 }),
  ]);
  const items = rows.map((n): NotificationDTO => {
    let data = {};
    try {
      data = JSON.parse(n.data);
    } catch {}
    return { id: n.id, type: n.type, text: (TEXT[n.type] ?? (() => "Avviso"))(data), createdAt: n.createdAt.toISOString(), read: !!n.readAt };
  });
  return {
    invites: invites.map(
      (i): InviteDTO => ({ id: i.id, folderName: i.folder.name, from: i.inviter, createdAt: i.createdAt.toISOString() }),
    ),
    items,
    unread: invites.length + items.filter((n) => !n.read).length,
  };
}

export async function markAllRead(userId: string) {
  await db.notification.updateMany({ where: { userId, readAt: null }, data: { readAt: new Date() } });
}
