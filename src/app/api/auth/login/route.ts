import { createSession, verifyPassword } from "@/lib/auth";
import { db } from "@/lib/db";
import { ApiError, readJson, route } from "@/lib/http";
import { loginSchema } from "@/lib/validation";

export const POST = route(async (req) => {
  const data = loginSchema.parse(await readJson(req));
  const user = await db.user.findUnique({ where: { email: data.email } });
  // Stesso messaggio per email inesistente e password errata.
  if (!user || !(await verifyPassword(data.password, user.passwordHash))) {
    throw new ApiError(401, "Email o password non corretti");
  }
  await createSession(user.id);
  return { id: user.id, name: user.name, email: user.email };
});
