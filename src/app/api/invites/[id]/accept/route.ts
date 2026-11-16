import { requireUser } from "@/lib/auth";
import { route } from "@/lib/http";
import { acceptInvite } from "@/lib/materials";

// Accetta un invito indirizzato alla mia email Google: la cartella viene condivisa con me su Drive.
export const POST = route<{ id: string }>(async (_req, { id }) => {
  const user = await requireUser();
  return acceptInvite(user.id, id);
});
