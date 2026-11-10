import { createHash, randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { cookies, headers } from "next/headers";
import { db } from "./db";
import { ApiError, currentMethod } from "./http";

export const SESSION_COOKIE = "ps_session";
const SESSION_DAYS = 30;

export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

export const hashPassword = (password: string) => bcrypt.hash(password, 11);
export const verifyPassword = (password: string, hash: string) => bcrypt.compare(password, hash);

export async function createSession(userId: string) {
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86_400_000);
  // Nel database finisce solo l'hash: un dump del DB non permette di rubare sessioni.
  await db.session.create({ data: { tokenHash: hashToken(token), userId, expiresAt } });
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
}

export async function destroySession() {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) await db.session.deleteMany({ where: { tokenHash: hashToken(token) } });
  store.delete(SESSION_COOKIE);
}

export type TokenScope = "read" | "write" | "feed";

/** Un token nuovo: il valore va mostrato una volta sola, nel database finisce l'hash. */
export function newApiToken() {
  const token = `ps_${randomBytes(24).toString("base64url")}`;
  return { token, tokenHash: hashToken(token), prefix: token.slice(0, 9) };
}

/** L'utente di un token valido con uno degli ambiti indicati, altrimenti null. */
export async function userFromApiToken(token: string, scopes: TokenScope[]) {
  const row = await db.apiToken.findUnique({ where: { tokenHash: hashToken(token) }, include: { user: true } });
  if (!row || !(scopes as string[]).includes(row.scope)) return null;
  if (row.expiresAt && row.expiresAt < new Date()) return null;
  // L'ultimo utilizzo si aggiorna al massimo una volta al minuto.
  if (!row.lastUsedAt || Date.now() - row.lastUsedAt.getTime() > 60_000) {
    await db.apiToken.update({ where: { id: row.id }, data: { lastUsedAt: new Date() } });
  }
  return { user: row.user, scope: row.scope as TokenScope };
}

export async function getUser({ sessionOnly = false } = {}) {
  const auth = (await headers()).get("authorization");
  if (auth?.toLowerCase().startsWith("bearer ")) {
    if (sessionOnly) throw new ApiError(403, "Questa operazione richiede l'accesso dal sito, non un token");
    const found = await userFromApiToken(auth.slice(7).trim(), ["read", "write"]);
    if (!found) return null;
    const reading = ["GET", "HEAD", "OPTIONS"].includes(currentMethod());
    if (!reading && found.scope !== "write") throw new ApiError(403, "Il token è in sola lettura");
    return found.user;
  }
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const session = await db.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: true },
  });
  if (!session || session.expiresAt < new Date()) return null;
  return session.user;
}

/** Con sessionOnly i token API non bastano (es. per gestire i token stessi). */
export async function requireUser(opts: { sessionOnly?: boolean } = {}) {
  const user = await getUser(opts);
  if (!user) throw new ApiError(401, "Accesso richiesto");
  return user;
}

export const DEFAULT_PHASE_TEMPLATES = [
  { name: "Introduzione", modality: "frontale", durationMin: 5 },
  { name: "Attività a coppie", modality: "", durationMin: 20 },
  { name: "Lavoro individuale", modality: "", durationMin: 15 },
  { name: "Lavoro a gruppi", modality: "", durationMin: 20 },
  { name: "Messa in comune", modality: "presentazione dialogata", durationMin: 10 },
  { name: "Esercitazione", modality: "a coppie", durationMin: 20 },
  { name: "Sintesi dialogata", modality: "", durationMin: 5 },
  { name: "Conclusione", modality: "dialogata", durationMin: 5 },
];
