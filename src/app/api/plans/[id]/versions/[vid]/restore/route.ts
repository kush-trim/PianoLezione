import { randomUUID } from "node:crypto";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { notFound, route } from "@/lib/http";
import { getPlan, phaseRows, snapshotPlan, type Snapshot } from "@/lib/plans";

export const POST = route<{ id: string; vid: string }>(async (_req, { id, vid }) => {
  const user = await requireUser();
  const current = await getPlan(user.id, id);
  const version = await db.planVersion.findFirst({ where: { id: vid, planId: id } });
  if (!version) throw notFound();
  const s = JSON.parse(version.snapshot) as Snapshot;

  // Prima di ripristinare si salva lo stato attuale: il ripristino è annullabile.
  await snapshotPlan(current, true);

  await db.$transaction(async (tx) => {
    await tx.lessonPlan.update({
      where: { id },
      data: {
        title: s.title,
        prerequisiti: s.prerequisiti,
        obiettivoInsegnamento: s.obiettivoInsegnamento,
        traguardo: s.traguardo,
        obiettivoApprendimento: s.obiettivoApprendimento,
        verifica: s.verifica,
        allegati: s.allegati,
        allegatiAuto: s.allegatiAuto,
        sezioniExtra: JSON.stringify(s.sezioniExtra),
      },
    });
    await tx.phase.deleteMany({ where: { planId: id } });
    await tx.phase.createMany({
      data: phaseRows(
        s.phases.map((p) => ({ ...p, id: randomUUID() })),
        true,
      ).map((r) => ({ ...r, planId: id })),
    });
  });
  return getPlan(user.id, id);
});
