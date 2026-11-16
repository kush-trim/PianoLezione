// Accesso con Google (OAuth 2.0, "authorization code" con PKCE), lato server, senza librerie.
// Il refresh token permette di usare Drive anche quando l'utente non è collegato: si salva
// cifrato e non esce mai dal server.

import { createHash, randomBytes } from "node:crypto";

export const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file";
export const LOGIN_SCOPES = ["openid", "email", "profile", DRIVE_SCOPE];

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo";

export class GoogleError extends Error {
  /** true se l'accesso dell'app è stato revocato o è scaduto: serve un nuovo accesso con Google. */
  constructor(
    message: string,
    public readonly needsLogin = false,
  ) {
    super(message);
  }
}

export function googleConfig() {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret };
}

/** Indirizzo pubblico del sito: dietro il tunnel la richiesta arriva da 127.0.0.1, quindi si usa APP_URL. */
export function appUrl(req: Request): string {
  const fromEnv = process.env.APP_URL?.trim().replace(/\/+$/, "");
  return fromEnv || new URL(req.url).origin;
}

export const redirectUri = (req: Request) => `${appUrl(req)}/api/auth/google/callback`;

const b64url = (buf: Buffer) => buf.toString("base64url");

/** Coppia PKCE: il verifier resta nel cookie, la challenge va a Google. */
export function pkcePair() {
  const verifier = b64url(randomBytes(32));
  const challenge = b64url(createHash("sha256").update(verifier).digest());
  return { verifier, challenge };
}

export const randomState = () => b64url(randomBytes(24));

/** Solo percorsi interni del sito: niente indirizzi esterni dopo l'accesso. */
export function safeNext(next: string | null | undefined): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\") || next.startsWith("/api/")) return "/settimana";
  return next.slice(0, 500);
}

export function buildAuthUrl(opts: {
  clientId: string;
  redirectUri: string;
  state: string;
  challenge: string;
  scopes: string[];
  /** "consent" forza la schermata dei permessi (serve per avere il refresh token). */
  prompt: "consent" | "select_account";
  loginHint?: string;
}): string {
  const p = new URLSearchParams({
    client_id: opts.clientId,
    redirect_uri: opts.redirectUri,
    response_type: "code",
    scope: opts.scopes.join(" "),
    state: opts.state,
    code_challenge: opts.challenge,
    code_challenge_method: "S256",
    access_type: "offline",
    include_granted_scopes: "true",
    prompt: opts.prompt,
  });
  if (opts.loginHint) p.set("login_hint", opts.loginHint);
  return `${AUTH_URL}?${p}`;
}

type TokenResponse = {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  scope?: string;
  error?: string;
  error_description?: string;
};

async function tokenRequest(body: Record<string, string>): Promise<TokenResponse> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body),
    signal: AbortSignal.timeout(15_000),
  });
  const data = (await res.json().catch(() => ({}))) as TokenResponse;
  if (!res.ok || !data.access_token) {
    // invalid_grant: token revocato o scaduto.
    throw new GoogleError(`Google ha rifiutato la richiesta (${data.error ?? res.status})`, data.error === "invalid_grant");
  }
  return data;
}

export function exchangeCode(code: string, verifier: string, redirect: string) {
  const cfg = googleConfig();
  if (!cfg) throw new GoogleError("Accesso con Google non configurato sul server");
  return tokenRequest({
    code,
    code_verifier: verifier,
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    redirect_uri: redirect,
    grant_type: "authorization_code",
  });
}

export function refreshAccessToken(refreshToken: string) {
  const cfg = googleConfig();
  if (!cfg) throw new GoogleError("Accesso con Google non configurato sul server");
  return tokenRequest({
    refresh_token: refreshToken,
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    grant_type: "refresh_token",
  });
}

export type GoogleProfile = { sub: string; email: string; emailVerified: boolean; name: string };

export async function fetchProfile(accessToken: string): Promise<GoogleProfile> {
  const res = await fetch(USERINFO_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new GoogleError("Non riesco a leggere il profilo Google");
  const d = (await res.json()) as { sub?: string; email?: string; email_verified?: boolean; name?: string };
  if (!d.sub || !d.email) throw new GoogleError("Il profilo Google non ha un'email");
  return { sub: d.sub, email: d.email.toLowerCase(), emailVerified: d.email_verified === true, name: d.name?.trim() || d.email.split("@")[0] };
}

export const hasDriveScope = (scopes: string) => scopes.split(/\s+/).includes(DRIVE_SCOPE);

/** Cookie temporaneo con state e verifier PKCE, durante il giro da Google. */
export const OAUTH_COOKIE = "ps_oauth";
