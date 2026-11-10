import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { readJson, route } from "@/lib/http";

const schema = z.object({ ids: z.array(z.string()).min(1).max(1000) });

// POST /api/plans/bulk-delete → elimina più piani in una volta (selezione multipla, Annulla di una copia).
export const POST = route(async (req) => {
  const user = await requireUser();
  const { ids } = schema.parse(await readJson(req));
  const { count } = await db.lessonPlan.deleteMany({ where: { userId: user.id, id: { in: ids } } });
  return { deleted: count };
});
