import { requireUser } from "@/lib/auth";
import { route } from "@/lib/http";
import { removeMember } from "@/lib/materials";

// Il proprietario toglie un membro, oppure il membro esce (userId = sé stesso).
// La condivisione su Drive viene tolta e i file spariscono dai piani del membro.
export const DELETE = route<{ id: string; userId: string }>(async (_req, { id, userId }) => {
  const user = await requireUser();
  await removeMember(user.id, id, userId);
});
