import { NextResponse } from "next/server";
import { z } from "zod";
import { encrypt } from "@/lib/crypto";
import { db } from "@/lib/db";
import { signInWithGoogle } from "@/lib/google-account";
import { finishLogin } from "@/lib/google-login";
import { DRIVE_SCOPE } from "@/lib/google-oauth";
import { ApiError, readJson, route } from "@/lib/http";

const schema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email()),
  name: z.string().trim().min(1).max(100).optional(),
  /** false: simula un utente che non ha autorizzato Google Drive. */
  drive: z.boolean().default(true),
  /** Dopo l'accesso reindirizza qui (per provare l'accesso dal browser). */
  redirect: z.string().optional(),
});

// POST /api/auth/dev-login → accesso senza Google, SOLO per le prove in locale
// (NODE_ENV diverso da production e DEV_LOGIN=1). In produzione non esiste.
export const POST = route(async (req) => {
  if (process.env.NODE_ENV === "production" || process.env.DEV_LOGIN !== "1") throw new ApiError(404, "Non trovato");
  const data = schema.parse(await readJson(req));
  const sub = `dev-${data.email}`;
  const scopes = ["openid", "email", "profile", ...(data.drive ? [DRIVE_SCOPE] : [])].join(" ");
  const { userId, created, linked } = await signInWithGoogle(
    { sub, email: data.email, emailVerified: true, name: data.name ?? data.email.split("@")[0] },
    { refreshToken: data.drive ? "dev-refresh-token" : undefined, scopes },
  );
  // Rientrando senza Drive, il token salvato si toglie (come una revoca su Google).
  if (!data.drive) await db.googleAccount.update({ where: { userId }, data: { refreshTokenEnc: "", scopes } });
  else await db.googleAccount.update({ where: { userId }, data: { refreshTokenEnc: encrypt("dev-refresh-token"), scopes } });
  await finishLogin(userId);
  if (data.redirect) return NextResponse.redirect(new URL(data.redirect, req.url), 303);
  return { userId, created, linked };
});
