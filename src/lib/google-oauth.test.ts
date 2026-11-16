import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { buildAuthUrl, DRIVE_SCOPE, hasDriveScope, LOGIN_SCOPES, pkcePair, randomState, safeNext } from "./google-oauth";

describe("accesso con Google", () => {
  it("PKCE: la challenge è lo SHA-256 del verifier, in base64url", () => {
    const { verifier, challenge } = pkcePair();
    expect(verifier).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(challenge).toBe(createHash("sha256").update(verifier).digest("base64url"));
    expect(pkcePair().verifier).not.toBe(verifier);
  });

  it("lo state è casuale", () => {
    expect(randomState()).not.toBe(randomState());
    expect(randomState().length).toBeGreaterThanOrEqual(32);
  });

  it("dopo l'accesso si torna solo a pagine del sito", () => {
    expect(safeNext("/piani/abc?x=1")).toBe("/piani/abc?x=1");
    expect(safeNext(null)).toBe("/settimana");
    expect(safeNext("https://evil.example")).toBe("/settimana");
    expect(safeNext("//evil.example")).toBe("/settimana");
    expect(safeNext("/\\evil.example")).toBe("/settimana");
    expect(safeNext("/api/auth/logout")).toBe("/settimana");
    expect(safeNext("javascript:alert(1)")).toBe("/settimana");
  });

  it("l'indirizzo di Google chiede codice, PKCE, accesso offline e i permessi giusti", () => {
    const url = new URL(
      buildAuthUrl({
        clientId: "id.apps.googleusercontent.com",
        redirectUri: "https://esempio.ch/api/auth/google/callback",
        state: "STATE",
        challenge: "CHALLENGE",
        scopes: LOGIN_SCOPES,
        prompt: "consent",
        loginHint: "a@b.ch",
      }),
    );
    expect(url.origin + url.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    const p = url.searchParams;
    expect(p.get("response_type")).toBe("code");
    expect(p.get("code_challenge_method")).toBe("S256");
    expect(p.get("code_challenge")).toBe("CHALLENGE");
    expect(p.get("state")).toBe("STATE");
    expect(p.get("access_type")).toBe("offline");
    expect(p.get("prompt")).toBe("consent");
    expect(p.get("login_hint")).toBe("a@b.ch");
    expect(p.get("scope")?.split(" ")).toEqual(["openid", "email", "profile", DRIVE_SCOPE]);
  });

  it("riconosce il permesso per Google Drive tra quelli concessi", () => {
    expect(hasDriveScope(`openid email ${DRIVE_SCOPE}`)).toBe(true);
    expect(hasDriveScope("openid email profile")).toBe(false);
    expect(hasDriveScope("")).toBe(false);
  });
});
