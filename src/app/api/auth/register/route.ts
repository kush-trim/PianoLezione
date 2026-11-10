import { createSession, DEFAULT_PHASE_TEMPLATES, hashPassword } from "@/lib/auth";
import { db } from "@/lib/db";
import { ApiError, readJson, route } from "@/lib/http";
import { registerSchema } from "@/lib/validation";

export const POST = route(async (req) => {
  const data = registerSchema.parse(await readJson(req));
  const exists = await db.user.findUnique({ where: { email: data.email } });
  if (exists) throw new ApiError(409, "Esiste già un account con questa email");

  const user = await db.user.create({
    data: {
      name: data.name,
      email: data.email,
      passwordHash: await hashPassword(data.password),
      phaseTemplates: {
        create: DEFAULT_PHASE_TEMPLATES.map((t, order) => ({ ...t, order })),
      },
    },
  });
  await createSession(user.id);
  return { id: user.id, name: user.name, email: user.email };
});
