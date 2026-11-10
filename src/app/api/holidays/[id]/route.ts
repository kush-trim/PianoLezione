import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { notFound, route } from "@/lib/http";

export const DELETE = route<{ id: string }>(async (_req, { id }) => {
  const user = await requireUser();
  const { count } = await db.holiday.deleteMany({ where: { id, userId: user.id } });
  if (!count) throw notFound();
});
