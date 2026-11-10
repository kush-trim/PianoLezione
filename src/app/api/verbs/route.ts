import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { ApiError, readJson, route } from "@/lib/http";
import { ensureSettings } from "@/lib/settings";
import { verbSchema } from "@/lib/validation";

const select = { id: true, kind: true, text: true };

export const GET = route(async () => {
  const user = await requireUser();
  await ensureSettings(user.id);
  return db.verb.findMany({ where: { userId: user.id }, orderBy: [{ kind: "asc" }, { order: "asc" }], select });
});

export const POST = route(async (req) => {
  const user = await requireUser();
  const data = verbSchema.parse(await readJson(req));
  const same = await db.verb.findMany({ where: { userId: user.id, kind: data.kind }, select: { text: true } });
  if (same.some((v) => v.text.toLowerCase() === data.text.toLowerCase())) {
    throw new ApiError(409, "Questo verbo è già nell'elenco");
  }
  return db.verb.create({ data: { ...data, userId: user.id, order: same.length }, select });
});
