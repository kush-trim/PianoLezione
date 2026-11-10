import { createHash, randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { db } from "./db";
import { ApiError } from "./http";

export const SESSION_COOKIE = "ps_session";
const SESSION_DAYS = 30;

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

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

export async function getUser() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const session = await db.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: true },
  });
  if (!session || session.expiresAt < new Date()) return null;
  return session.user;
}

export async function requireUser() {
  const user = await getUser();
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
