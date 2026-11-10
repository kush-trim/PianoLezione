import { newApiToken, requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { readJson, route } from "@/lib/http";
import { tokenSelect as select, toTokenDTO } from "@/lib/tokens";
import { tokenCreateSchema } from "@/lib/validation";

// I token si gestiscono solo dal sito: un token non può crearne altri.
export const GET = route(async () => {
  const user = await requireUser({ sessionOnly: true });
  const rows = await db.apiToken.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, select });
  return rows.map(toTokenDTO);
});

// Il valore del token compare solo in questa risposta.
export const POST = route(async (req) => {
  const user = await requireUser({ sessionOnly: true });
  const data = tokenCreateSchema.parse(await readJson(req));
  const { token, tokenHash, prefix } = newApiToken();
  const row = await db.apiToken.create({
    data: {
      userId: user.id,
      name: data.name,
      scope: data.scope,
      tokenHash,
      prefix,
      expiresAt: data.expiresInDays ? new Date(Date.now() + data.expiresInDays * 86_400_000) : null,
    },
    select,
  });
  return { ...toTokenDTO(row), token };
});
