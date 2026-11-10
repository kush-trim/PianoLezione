import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { readJson, route } from "@/lib/http";
import { createSchoolYear } from "@/lib/school-years";
import { ensureSettings } from "@/lib/settings";
import { schoolYearSchema } from "@/lib/validation";

const select = { id: true, name: true, startDate: true, endDate: true };

export const GET = route(async () => {
  const user = await requireUser();
  await ensureSettings(user.id);
  return db.schoolYear.findMany({ where: { userId: user.id }, orderBy: { startDate: "desc" }, select });
});

// Un anno nuovo porta con sé la sua cartella ("Anno 2027/2028") in Cartelle.
export const POST = route(async (req) => {
  const user = await requireUser();
  const data = schoolYearSchema.parse(await readJson(req));
  const { yearId, folderId } = await createSchoolYear(user.id, data);
  const year = await db.schoolYear.findUniqueOrThrow({ where: { id: yearId }, select });
  return { ...year, folderId };
});
