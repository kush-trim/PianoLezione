import { db } from "@/lib/db";
import { route } from "@/lib/http";

// Controllo di salute usato dal deploy: risponde 200 solo se anche il database funziona.
export const GET = route(async () => {
  await db.$queryRaw`SELECT 1`;
  return { ok: true };
});
