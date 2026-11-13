import { readFileSync } from "node:fs";
import { db } from "@/lib/db";
import { route } from "@/lib/http";

// Il commit in produzione: lo scrive il deploy nel file VERSION accanto all'app.
let version: string | undefined;
function deployedVersion(): string {
  if (version === undefined) {
    try {
      version = readFileSync("VERSION", "utf8").trim() || "sconosciuta";
    } catch {
      version = "sviluppo";
    }
  }
  return version;
}

// Controllo di salute usato dal deploy: risponde 200 solo se anche il database funziona,
// e dice quale versione è in esecuzione.
export const GET = route(async () => {
  await db.$queryRaw`SELECT 1`;
  return { ok: true, version: deployedVersion() };
});
