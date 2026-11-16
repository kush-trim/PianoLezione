import { requireUser } from "@/lib/auth";
import { readJson, route } from "@/lib/http";
import { invite } from "@/lib/materials";
import { inviteSchema } from "@/lib/validation";

// POST /api/material-folders/:id/invites { email } → invita un collega (email Google).
// Se è già iscritto lo trova tra le notifiche; altrimenti l'invito lo aspetta al primo accesso.
export const POST = route<{ id: string }>(async (req, { id }) => {
  const user = await requireUser();
  const { email } = inviteSchema.parse(await readJson(req));
  return invite(user.id, id, email);
});
