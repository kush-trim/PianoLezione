import { requireUser } from "@/lib/auth";
import { route } from "@/lib/http";
import { declineInvite } from "@/lib/materials";

export const POST = route<{ id: string }>(async (_req, { id }) => {
  const user = await requireUser();
  await declineInvite(user.id, id);
});
