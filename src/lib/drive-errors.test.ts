import { describe, expect, it } from "vitest";
import { driveError } from "./drive-errors";

const googleBody = (reason: string, message = "") =>
  JSON.stringify({ error: { code: 403, message, errors: [{ reason, message, domain: "global" }] } });

describe("errori di Google Drive", () => {
  it("Google non permette di condividere la cartella: messaggio chiaro, non un errore del server", () => {
    const e = driveError(403, googleBody("appNotAuthorizedToChild", "The user may not have granted the app write access to all of the children"));
    expect(e.status).toBe(409);
    expect(e.message).toMatch(/non ha permesso di condividere questa cartella/);
  });

  it("spazio esaurito", () => {
    expect(driveError(403, googleBody("storageQuotaExceeded")).message).toMatch(/spazio/);
  });

  it("file o cartella spariti da Drive", () => {
    expect(driveError(404, "").status).toBe(404);
  });

  // Cloudflare sostituisce le risposte 502 e 504 con una sua pagina HTML: il sito
  // perderebbe il messaggio e mostrerebbe solo «Qualcosa non ha funzionato.».
  it("gli altri rifiuti non usano 502 né 504", () => {
    for (const status of [400, 403, 429, 500, 503]) {
      const e = driveError(status, "boh");
      expect([502, 504]).not.toContain(e.status);
      expect(e.message).toBe("Google Drive ha rifiutato l'operazione");
    }
  });
});
