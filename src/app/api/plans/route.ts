import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { readJson, route } from "@/lib/http";
import { assertOwned, clonePlan, getPlan, listPlans } from "@/lib/plans";
import { ensureSettings } from "@/lib/settings";
import { planCreateSchema } from "@/lib/validation";

// GET /api/plans?folderId=<id|none>&q=<testo>&templates=1&limit=<n> (q: titolo, obiettivi, fasi, verifica, note, classe, materia)
export const GET = route(async (req) => {
  const user = await requireUser();
  const sp = new URL(req.url).searchParams;
  const folderId = sp.get("folderId");
  const q = sp.get("q")?.trim();
  const limit = Number(sp.get("limit")) || undefined;

  return listPlans(
    user.id,
    {
      isTemplate: sp.get("templates") === "1",
      ...(folderId === "none" ? { folderId: null } : folderId ? { folderId } : {}),
      // Il testo si cerca nel titolo e in tutto il piano: obiettivi, fasi, verifica, note, classe e materia.
      ...(q
        ? {
            OR: [
              { title: { contains: q } },
              { prerequisiti: { contains: q } },
              { obiettivoInsegnamento: { contains: q } },
              { traguardo: { contains: q } },
              { obiettivoApprendimento: { contains: q } },
              { obiettiviInsJson: { contains: q } },
              { obiettiviAppJson: { contains: q } },
              { verifica: { contains: q } },
              { allegati: { contains: q } },
              { notaPost: { contains: q } },
              { phases: { some: { OR: [{ name: { contains: q } }, { descrizione: { contains: q } }, { obiettiviSpecifici: { contains: q } }, { materiale: { contains: q } }] } } },
              { slots: { some: { slot: { OR: [{ className: { contains: q } }, { subject: { contains: q } }] } } } },
            ],
          }
        : {}),
    },
    limit,
  );
});

export const POST = route(async (req) => {
  const user = await requireUser();
  const data = planCreateSchema.parse(await readJson(req));
  await assertOwned(user.id, { folderId: data.folderId, slotIds: data.slotIds });

  if (data.fromTemplateId) {
    const template = await getPlan(user.id, data.fromTemplateId);
    return clonePlan(user.id, template, {
      title: data.title ?? template.title,
      isTemplate: false,
      folderId: data.folderId,
      date: data.date,
      slotIds: data.slotIds,
    });
  }

  // Senza una lezione dell'orario il piano parte con la durata predefinita delle Impostazioni.
  const settings = await ensureSettings(user.id);
  const declared =
    data.manualDuration ?? (data.slotIds?.length ? null : settings.defaultHours * settings.lessonMinutes);

  const plan = await db.lessonPlan.create({
    data: {
      userId: user.id,
      title: data.title ?? "",
      date: data.date ?? null,
      folderId: data.folderId ?? null,
      manualStart: data.manualStart ?? null,
      manualDuration: declared,
      slots: { create: (data.slotIds ?? []).map((slotId) => ({ slotId })) },
    },
  });
  return getPlan(user.id, plan.id);
});
