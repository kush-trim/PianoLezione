// Google Drive, lato server. Ogni operazione avviene con l'account Google di un utente preciso
// (per le cartelle condivise: il proprietario, sul cui Drive stanno i file).
// Permesso "drive.file": l'app vede e modifica solo cartelle e file che ha creato lei.
// Con DRIVE_FAKE=1 (mai in produzione) Drive è simulato in memoria, per le prove.

import { randomBytes } from "node:crypto";
import { decrypt } from "./crypto";
import { db } from "./db";
import { GoogleError, hasDriveScope, refreshAccessToken } from "./google-oauth";
import { ApiError } from "./http";

export type DriveFile = { id: string; name: string; mimeType: string; size: number; webViewLink: string };

/** Spazio del Drive dell'utente, in byte. limit è null se lo spazio è illimitato. */
export type DriveQuota = { usage: number; limit: number | null };

export interface DriveClient {
  /** La cartella "PianoStudio" dell'utente: creata la prima volta, ricreata se è stata cestinata. */
  appFolder(): Promise<string>;
  createFolder(name: string, parentId: string): Promise<{ id: string; webViewLink: string }>;
  upload(parentId: string, name: string, mimeType: string, data: Uint8Array): Promise<DriveFile>;
  /** Il contenuto di un file. */
  download(id: string): Promise<Uint8Array>;
  rename(id: string, name: string): Promise<void>;
  /** Sposta un file (o una cartella) da una cartella a un'altra. */
  move(id: string, fromParentId: string, toParentId: string): Promise<void>;
  /** Spazio usato e disponibile sul Drive dell'utente. */
  quota(): Promise<DriveQuota>;
  /** Nel cestino di Drive: recuperabile per 30 giorni. */
  trash(id: string): Promise<void>;
  /** Condivide con un altro account Google come "editor"; restituisce l'id del permesso. */
  share(id: string, email: string): Promise<string>;
  unshare(id: string, permissionId: string): Promise<void>;
}

const FOLDER_MIME = "application/vnd.google-apps.folder";
const API = "https://www.googleapis.com/drive/v3/files";
const UPLOAD = "https://www.googleapis.com/upload/drive/v3/files";

export const driveFake = () => process.env.DRIVE_FAKE === "1" && process.env.NODE_ENV !== "production";

// --- Token: l'access token resta in memoria fino a poco prima della scadenza ---

const tokens = new Map<string, { value: string; expires: number }>();

async function accessToken(userId: string): Promise<string> {
  const cached = tokens.get(userId);
  if (cached && cached.expires > Date.now() + 60_000) return cached.value;
  const account = await db.googleAccount.findUnique({ where: { userId } });
  const refresh = account ? decrypt(account.refreshTokenEnc) : null;
  if (!account || !refresh || !hasDriveScope(account.scopes)) throw new DriveNotAuthorized(userId);
  try {
    const t = await refreshAccessToken(refresh);
    tokens.set(userId, { value: t.access_token, expires: Date.now() + t.expires_in * 1000 });
    return t.access_token;
  } catch (e) {
    if (e instanceof GoogleError && e.needsLogin) {
      // Accesso revocato dall'utente su Google: il token salvato non serve più.
      await db.googleAccount.update({ where: { userId }, data: { refreshTokenEnc: "" } });
      throw new DriveNotAuthorized(userId);
    }
    throw new ApiError(502, "Google Drive non risponde. Riprova tra poco.");
  }
}

export function forgetToken(userId: string) {
  tokens.delete(userId);
}

/** L'utente (di solito il proprietario di una cartella) non ha autorizzato Drive, o l'ha revocato. */
export class DriveNotAuthorized extends ApiError {
  constructor(public readonly userId: string) {
    super(409, "Google Drive non è autorizzato per questo account: serve un nuovo accesso con Google.");
  }
}

// --- Drive vero ---

async function call(userId: string, url: string, init: RequestInit = {}): Promise<Response> {
  const token = await accessToken(userId);
  const res = await fetch(url, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, ...(init.headers ?? {}) },
    signal: AbortSignal.timeout(60_000),
  });
  if (res.status === 401) {
    forgetToken(userId);
    throw new DriveNotAuthorized(userId);
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.error("Google Drive", res.status, url.replace(/\?.*/, ""), body.slice(0, 500));
    if (res.status === 404) throw new ApiError(404, "Il file o la cartella non esiste più su Google Drive");
    if (res.status === 403 && /storageQuota/i.test(body)) throw new ApiError(507, "Lo spazio su Google Drive è esaurito");
    throw new ApiError(502, "Google Drive ha rifiutato l'operazione");
  }
  return res;
}

const json = async <T>(res: Response) => (await res.json()) as T;

function realDrive(userId: string): DriveClient {
  const client: DriveClient = {
    async appFolder() {
      const account = await db.googleAccount.findUnique({ where: { userId }, select: { driveRootId: true } });
      if (account?.driveRootId) {
        const res = await fetch(`${API}/${account.driveRootId}?fields=id,trashed`, {
          headers: { Authorization: `Bearer ${await accessToken(userId)}` },
          signal: AbortSignal.timeout(15_000),
        });
        if (res.ok && !(await json<{ trashed?: boolean }>(res)).trashed) return account.driveRootId;
      }
      const res = await call(userId, `${API}?fields=id`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "PianoStudio", mimeType: FOLDER_MIME }),
      });
      const { id } = await json<{ id: string }>(res);
      await db.googleAccount.update({ where: { userId }, data: { driveRootId: id } });
      return id;
    },
    async createFolder(name, parentId) {
      const res = await call(userId, `${API}?fields=id,webViewLink`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, mimeType: FOLDER_MIME, parents: [parentId] }),
      });
      return json<{ id: string; webViewLink: string }>(res);
    },
    async upload(parentId, name, mimeType, data) {
      const boundary = `pianostudio-${randomBytes(12).toString("hex")}`;
      const meta = JSON.stringify({ name, parents: [parentId] });
      const body = Buffer.concat([
        Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n`),
        Buffer.from(`--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`),
        Buffer.from(data),
        Buffer.from(`\r\n--${boundary}--`),
      ]);
      const res = await call(userId, `${UPLOAD}?uploadType=multipart&fields=id,name,mimeType,size,webViewLink`, {
        method: "POST",
        headers: { "Content-Type": `multipart/related; boundary=${boundary}` },
        body,
      });
      const f = await json<{ id: string; name: string; mimeType: string; size?: string; webViewLink: string }>(res);
      return { id: f.id, name: f.name, mimeType: f.mimeType, size: Number(f.size ?? data.byteLength), webViewLink: f.webViewLink };
    },
    async download(id) {
      const res = await call(userId, `${API}/${id}?alt=media`);
      return new Uint8Array(await res.arrayBuffer());
    },
    async rename(id, name) {
      await call(userId, `${API}/${id}?fields=id`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
    },
    async move(id, from, to) {
      await call(userId, `${API}/${id}?addParents=${encodeURIComponent(to)}&removeParents=${encodeURIComponent(from)}&fields=id`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
    },
    async quota() {
      const res = await call(userId, "https://www.googleapis.com/drive/v3/about?fields=storageQuota(limit,usage)");
      const { storageQuota: q } = await json<{ storageQuota?: { limit?: string; usage?: string } }>(res);
      return { usage: Number(q?.usage ?? 0), limit: q?.limit ? Number(q.limit) : null };
    },
    async trash(id) {
      await call(userId, `${API}/${id}?fields=id`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trashed: true }),
      });
    },
    async share(id, email) {
      // Nessuna email di Google: l'invito lo gestisce il sito.
      const res = await call(userId, `${API}/${id}/permissions?sendNotificationEmail=false&fields=id`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "user", role: "writer", emailAddress: email }),
      });
      return (await json<{ id: string }>(res)).id;
    },
    async unshare(id, permissionId) {
      if (!permissionId) return;
      try {
        await call(userId, `${API}/${id}/permissions/${permissionId}`, { method: "DELETE" });
      } catch (e) {
        // Già tolto a mano su Drive: va bene così.
        if (!(e instanceof ApiError && e.status === 404)) throw e;
      }
    },
  };
  return client;
}

// --- Drive finto, per le prove ---

type FakeItem = {
  id: string;
  name: string;
  mimeType: string;
  parent: string | null;
  trashed: boolean;
  size: number;
  perms: Map<string, string>;
  data?: Uint8Array;
};
const fakeStore = new Map<string, FakeItem>();
const fakeRoots = new Map<string, string>();

function fakeDrive(userId: string): DriveClient {
  const id = () => `fake${randomBytes(10).toString("hex")}`;
  // Come il vero: senza autorizzazione a Drive (o con accesso revocato) non si fa nulla.
  const authorized = async () => {
    const acc = await db.googleAccount.findUnique({ where: { userId } });
    if (!acc || !acc.refreshTokenEnc || !hasDriveScope(acc.scopes)) throw new DriveNotAuthorized(userId);
  };
  const item = (i: string) => {
    const f = fakeStore.get(i);
    if (!f || f.trashed) throw new ApiError(404, "Il file o la cartella non esiste più su Google Drive");
    return f;
  };
  return {
    async appFolder() {
      await authorized();
      const existing = fakeRoots.get(userId);
      if (existing && fakeStore.get(existing) && !fakeStore.get(existing)!.trashed) return existing;
      const root = id();
      fakeStore.set(root, { id: root, name: "PianoStudio", mimeType: FOLDER_MIME, parent: null, trashed: false, size: 0, perms: new Map() });
      fakeRoots.set(userId, root);
      return root;
    },
    async createFolder(name, parentId) {
      await authorized();
      item(parentId);
      const f = id();
      fakeStore.set(f, { id: f, name, mimeType: FOLDER_MIME, parent: parentId, trashed: false, size: 0, perms: new Map() });
      return { id: f, webViewLink: `https://drive.google.com/drive/folders/${f}` };
    },
    async upload(parentId, name, mimeType, data) {
      await authorized();
      item(parentId);
      const f = id();
      fakeStore.set(f, { id: f, name, mimeType, parent: parentId, trashed: false, size: data.byteLength, perms: new Map(), data: data.slice() });
      return { id: f, name, mimeType, size: data.byteLength, webViewLink: `https://drive.google.com/file/d/${f}/view` };
    },
    async download(i) {
      await authorized();
      const f = item(i);
      return f.data ? f.data.slice() : new Uint8Array(f.size);
    },
    async rename(i, name) {
      await authorized();
      item(i).name = name;
    },
    async move(i, from, to) {
      await authorized();
      const f = item(i);
      item(to);
      if (f.parent !== from) throw new ApiError(400, "Il file non è nella cartella indicata");
      f.parent = to;
    },
    async quota() {
      await authorized();
      // I file di questo utente nel Drive finto, più 1 GB di "altro" per avere un numero realistico.
      const root = fakeRoots.get(userId);
      const mine = (it: FakeItem): boolean => {
        for (let p: FakeItem | undefined = it; p; p = p.parent ? fakeStore.get(p.parent) : undefined) if (p.id === root) return true;
        return false;
      };
      const usage = [...fakeStore.values()].filter((it) => !it.trashed && mine(it)).reduce((n, it) => n + it.size, 0);
      return { usage: usage + 1_000_000_000, limit: 15_000_000_000 };
    },
    async trash(i) {
      await authorized();
      item(i).trashed = true;
    },
    async share(i, email) {
      await authorized();
      const p = `perm${randomBytes(6).toString("hex")}`;
      item(i).perms.set(p, email);
      return p;
    },
    async unshare(i, permissionId) {
      await authorized();
      fakeStore.get(i)?.perms.delete(permissionId);
    },
  };
}

/** Il client Drive che agisce con l'account Google dell'utente indicato. */
export function driveFor(userId: string): DriveClient {
  return driveFake() ? fakeDrive(userId) : realDrive(userId);
}
