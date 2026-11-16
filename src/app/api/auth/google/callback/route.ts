import { cookies } from "next/headers";
import { connection, NextResponse } from "next/server";
import { signInWithGoogle } from "@/lib/google-account";
import { finishLogin } from "@/lib/google-login";
import { exchangeCode, fetchProfile, GoogleError, OAUTH_COOKIE, redirectUri, safeNext } from "@/lib/google-oauth";

// GET /api/auth/google/callback?code=…&state=… → ritorno da Google: accesso e sessione.
export async function GET(req: Request) {
  await connection();
  const url = new URL(req.url);
  const store = await cookies();
  const raw = store.get(OAUTH_COOKIE)?.value;
  store.delete({ name: OAUTH_COOKIE, path: "/api/auth/google" });
  const fail = (why: string) => NextResponse.redirect(new URL(`/login?errore=${why}`, req.url));

  let saved: { state: string; verifier: string; next: string } | null = null;
  try {
    saved = raw ? JSON.parse(raw) : null;
  } catch {}
  // Lo state deve essere quello generato da questo browser: protegge da accessi forzati.
  if (!saved || !saved.state || saved.state !== url.searchParams.get("state")) return fail("sessione");
  if (url.searchParams.get("error")) return fail(url.searchParams.get("error") === "access_denied" ? "annullato" : "google");
  const code = url.searchParams.get("code");
  if (!code) return fail("google");

  try {
    const tokens = await exchangeCode(code, saved.verifier, redirectUri(req));
    const profile = await fetchProfile(tokens.access_token);
    if (!profile.emailVerified) return fail("email");
    const { userId } = await signInWithGoogle(profile, { refreshToken: tokens.refresh_token, scopes: tokens.scope ?? "" });
    await finishLogin(userId);
  } catch (e) {
    console.error("accesso con Google non riuscito:", e instanceof GoogleError ? e.message : e);
    return fail("google");
  }
  return NextResponse.redirect(new URL(safeNext(saved.next), req.url));
}
