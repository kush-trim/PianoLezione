import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { notFound, route } from "@/lib/http";

// Revoca: il token smette subito di funzionare.
export const DELETE = route<{ id: string }>(async (_req, { id }) => {
  const user = await requireUser({ sessionOnly: true });
  const { count } = await db.apiToken.deleteMany({ where: { id, userId: user.id } });
  if (!count) throw notFound();
});
