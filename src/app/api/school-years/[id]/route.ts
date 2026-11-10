import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { notFound, readJson, route } from "@/lib/http";
import { schoolYearSchema } from "@/lib/validation";

type P = { id: string };

export const PUT = route<P>(async (req, { id }) => {
  const user = await requireUser();
  const data = schoolYearSchema.parse(await readJson(req));
  const { count } = await db.schoolYear.updateMany({ where: { id, userId: user.id }, data });
  if (!count) throw notFound();
});

export const DELETE = route<P>(async (_req, { id }) => {
  const user = await requireUser();
  const { count } = await db.schoolYear.deleteMany({ where: { id, userId: user.id } });
  if (!count) throw notFound();
});
