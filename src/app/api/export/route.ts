import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { route } from "@/lib/http";
import { today } from "@/lib/plan-utils";

// GET /api/export → copia di sicurezza di tutti i dati dell'utente, in JSON.
// Senza segreti: niente password, sessioni, token, chiavi AI né link dei calendari.
export const GET = route(async () => {
  const user = await requireUser();
  const where = { userId: user.id };
  const [folders, slots, plans, phaseTemplates, verbs, schoolYears, holidays, events, settings] = await Promise.all([
    db.folder.findMany({ where, omit: { userId: true } }),
    db.timetableSlot.findMany({ where, omit: { userId: true }, include: { exceptions: true } }),
    db.lessonPlan.findMany({
      where,
      omit: { userId: true },
      include: { phases: { orderBy: { order: "asc" } }, slots: { select: { slotId: true } } },
    }),
    db.phaseTemplate.findMany({ where, omit: { userId: true } }),
    db.verb.findMany({ where, omit: { userId: true } }),
    db.schoolYear.findMany({ where, omit: { userId: true } }),
    db.holiday.findMany({ where, omit: { userId: true } }),
    db.event.findMany({ where, omit: { userId: true } }),
    db.userSettings.findUnique({ where, select: { lessonMinutes: true, defaultHours: true, aiProvider: true, aiModel: true } }),
  ]);
  const body = {
    formato: "pianostudio-backup",
    versione: 1,
    creato: new Date().toISOString(),
    utente: { name: user.name, email: user.email },
    settings,
    schoolYears,
    holidays,
    folders,
    slots,
    events,
    plans,
    phaseTemplates,
    verbs,
  };
  return new Response(JSON.stringify(body, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="pianostudio-${today()}.json"`,
    },
  });
});
