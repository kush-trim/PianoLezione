// Accesso con Google: dall'account Google all'utente di PianoStudio.

import { DEFAULT_PHASE_TEMPLATES } from "./auth";
import { encrypt } from "./crypto";
import { db } from "./db";
import { forgetToken } from "./google-drive";
import type { GoogleProfile } from "./google-oauth";

/**
 * Trova o crea l'utente per questo account Google:
 * 1. stesso account Google (sub) → stesso utente;
 * 2. altrimenti un account esistente con la stessa email (nato con email e password) → si collega;
 * 3. altrimenti un utente nuovo, con le fasi predefinite.
 * Il refresh token arriva solo quando Google mostra la schermata dei permessi: se manca si tiene quello salvato.
 */
export async function signInWithGoogle(
  profile: GoogleProfile,
  tokens: { refreshToken?: string; scopes: string },
): Promise<{ userId: string; created: boolean; linked: boolean }> {
  const tokenData = tokens.refreshToken ? { refreshTokenEnc: encrypt(tokens.refreshToken) } : {};

  const bySub = await db.googleAccount.findUnique({ where: { sub: profile.sub } });
  if (bySub) {
    await db.googleAccount.update({
      where: { userId: bySub.userId },
      data: { email: profile.email, scopes: tokens.scopes || bySub.scopes, ...tokenData },
    });
    forgetToken(bySub.userId);
    return { userId: bySub.userId, created: false, linked: false };
  }

  const byEmail = await db.user.findUnique({ where: { email: profile.email }, include: { googleAccount: true } });
  if (byEmail && !byEmail.googleAccount) {
    await db.googleAccount.create({
      data: { userId: byEmail.id, sub: profile.sub, email: profile.email, scopes: tokens.scopes, refreshTokenEnc: tokens.refreshToken ? encrypt(tokens.refreshToken) : "" },
    });
    return { userId: byEmail.id, created: false, linked: true };
  }

  // L'email è già di un altro account Google (caso raro: email riassegnata). Si crea un utente
  // nuovo con un'email interna, per non mescolare i dati.
  const email = byEmail ? `${profile.sub}@google.pianostudio` : profile.email;
  const user = await db.user.create({
    data: {
      name: profile.name.slice(0, 200),
      email,
      phaseTemplates: { create: DEFAULT_PHASE_TEMPLATES.map((t, order) => ({ ...t, order })) },
      googleAccount: {
        create: { sub: profile.sub, email: profile.email, scopes: tokens.scopes, refreshTokenEnc: tokens.refreshToken ? encrypt(tokens.refreshToken) : "" },
      },
    },
  });
  return { userId: user.id, created: true, linked: false };
}

/** L'email Google dell'utente (quella che conta per gli inviti), o quella dell'account. */
export async function googleEmailOf(userId: string): Promise<string | null> {
  const u = await db.user.findUnique({ where: { id: userId }, select: { email: true, googleAccount: { select: { email: true } } } });
  if (!u) return null;
  return (u.googleAccount?.email ?? u.email).toLowerCase();
}
