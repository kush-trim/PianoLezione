import { requireUser } from "@/lib/auth";
import { tagCounts } from "@/lib/exercises";
import { route } from "@/lib/http";

// GET /api/exercises/tags → le etichette usate negli esercizi che vedo, con quanti file le hanno.
export const GET = route(async () => {
  const user = await requireUser();
  return tagCounts(user.id);
});
