import { requireUser } from "@/lib/auth";
import { route } from "@/lib/http";
import { revokeInvite } from "@/lib/materials";

// Ritira un invito ancora in attesa.
export const DELETE = route<{ id: string; inviteId: string }>(async (_req, { id, inviteId }) => {
  const user = await requireUser();
  await revokeInvite(user.id, id, inviteId);
});
