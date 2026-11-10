import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { readJson, route } from "@/lib/http";
import { clonePlan, getPlan } from "@/lib/plans";

const schema = z.object({ asTemplate: z.boolean().optional() });

// Duplica un piano. Con asTemplate lo salva tra i modelli.
export const POST = route<{ id: string }>(async (req, { id }) => {
  const user = await requireUser();
  const { asTemplate = false } = schema.parse(await readJson(req));
  const source = await getPlan(user.id, id);
  const title = source.title || "Senza titolo";

  return clonePlan(user.id, source, {
    title: asTemplate ? title : `${title} (copia)`,
    isTemplate: asTemplate,
    // La copia resta nella stessa cartella ma non è agganciata a una lezione.
    folderId: asTemplate ? null : source.folderId,
    keepTiming: !asTemplate,
  });
});
