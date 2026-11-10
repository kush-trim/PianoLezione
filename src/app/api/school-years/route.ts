import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { readJson, route } from "@/lib/http";
import { ensureSettings } from "@/lib/settings";
import { schoolYearSchema } from "@/lib/validation";

const select = { id: true, name: true, startDate: true, endDate: true };

export const GET = route(async () => {
  const user = await requireUser();
  await ensureSettings(user.id);
  return db.schoolYear.findMany({ where: { userId: user.id }, orderBy: { startDate: "desc" }, select });
});

export const POST = route(async (req) => {
  const user = await requireUser();
  const data = schoolYearSchema.parse(await readJson(req));
  return db.schoolYear.create({ data: { ...data, userId: user.id }, select });
});
