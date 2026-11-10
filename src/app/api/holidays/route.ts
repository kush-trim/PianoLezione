import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { readJson, route } from "@/lib/http";
import { holidaySchema } from "@/lib/validation";

const select = { id: true, name: true, startDate: true, endDate: true };

export const GET = route(async () => {
  const user = await requireUser();
  return db.holiday.findMany({ where: { userId: user.id }, orderBy: { startDate: "asc" }, select });
});

export const POST = route(async (req) => {
  const user = await requireUser();
  const data = holidaySchema.parse(await readJson(req));
  return db.holiday.create({ data: { ...data, userId: user.id }, select });
});
