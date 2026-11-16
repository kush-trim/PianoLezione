import { NextResponse } from "next/server";
import { connection } from "next/server";
import { db } from "@/lib/db";
import { getUser } from "@/lib/auth";
import { buildAuthUrl, DRIVE_SCOPE, googleConfig, LOGIN_SCOPES, OAUTH_COOKIE, pkcePair, randomState, redirectUri, safeNext } from "@/lib/google-oauth";



// GET /api/auth/google?next=/percorso[&drive=1] → manda a Google.
// drive=1: l'utente è già dentro ma non ha autorizzato Google Drive; si chiede solo quel permesso.
export async function GET(req: Request) {
  await connection();
  const cfg = googleConfig();
  const url = new URL(req.url);
  if (!cfg) return NextResponse.redirect(new URL("/login?errore=configurazione", req.url));

  const next = safeNext(url.searchParams.get("next"));
  const driveOnly = url.searchParams.get("drive") === "1";
  const user = driveOnly ? await getUser({ sessionOnly: true }) : null;
  const account = user ? await db.googleAccount.findUnique({ where: { userId: user.id }, select: { email: true, refreshTokenEnc: true } }) : null;

  const { verifier, challenge } = pkcePair();
  const state = randomState();
  const target = buildAuthUrl({
    clientId: cfg.clientId,
    redirectUri: redirectUri(req),
    state,
    challenge,
    scopes: driveOnly ? [DRIVE_SCOPE] : LOGIN_SCOPES,
    // La schermata dei permessi serve quando manca il token per Drive (prima volta o revocato);
    // altrimenti basta scegliere l'account.
    prompt: driveOnly || !account?.refreshTokenEnc ? "consent" : "select_account",
    loginHint: account?.email,
  });

  const res = NextResponse.redirect(target);
  // state e verifier restano solo in un cookie httpOnly di 10 minuti, legato a questo browser.
  res.cookies.set(OAUTH_COOKIE, JSON.stringify({ state, verifier, next }), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/api/auth/google",
    maxAge: 600,
  });
  return res;
}
