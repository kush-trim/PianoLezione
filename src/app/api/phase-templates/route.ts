import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { readJson, route } from "@/lib/http";
import { phaseTemplateSchema } from "@/lib/validation";

const select = { id: true, name: true, modality: true, durationMin: true };

export const GET = route(async () => {
  const user = await requireUser();
  return db.phaseTemplate.findMany({
    where: { userId: user.id },
    orderBy: [{ order: "asc" }, { name: "asc" }],
    select,
  });
});

export const POST = route(async (req) => {
  const user = await requireUser();
  const data = phaseTemplateSchema.parse(await readJson(req));
  const order = await db.phaseTemplate.count({ where: { userId: user.id } });
  return db.phaseTemplate.create({ data: { ...data, userId: user.id, order }, select });
});
