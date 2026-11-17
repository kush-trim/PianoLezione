import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "./api";

afterEach(() => vi.unstubAllGlobals());

describe("client delle API", () => {
  it("un errore dell'app mostra il suo messaggio", async () => {
    vi.stubGlobal("fetch", async () => Response.json({ error: "Non trovato" }, { status: 404 }));
    await expect(api.post("/api/x")).rejects.toThrow("Non trovato");
  });

  it("una pagina di errore non JSON (es. Cloudflare) dice almeno il codice", async () => {
    vi.stubGlobal("fetch", async () => new Response("<html>Bad gateway</html>", { status: 502, headers: { "content-type": "text/html" } }));
    await expect(api.post("/api/x")).rejects.toThrow(/errore 502/);
  });
});
