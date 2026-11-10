import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { readJson, route } from "@/lib/http";
import { createSchoolYear } from "@/lib/school-years";
import { calendarApplySchema } from "@/lib/validation";

// Salva anno scolastico e vacanze lette dal calendario.
// Se l'anno (stesse date o sovrapposto) esiste già lo aggiorna; se è nuovo crea anche la sua cartella.
// Le vacanze già presenti con le stesse date non vengono duplicate.
export const POST = route(async (req) => {
  const user = await requireUser();
  const { year, holidays } = calendarApplySchema.parse(await readJson(req));

  const { yearId, created, folderId } = await createSchoolYear(user.id, year, { updateOverlapping: true });

  const existing = await db.holiday.findMany({ where: { userId: user.id }, select: { startDate: true, endDate: true } });
  const seen = new Set(existing.map((h) => `${h.startDate}|${h.endDate}`));
  const fresh = holidays.filter((h) => h.endDate >= h.startDate && !seen.has(`${h.startDate}|${h.endDate}`));
  if (fresh.length) await db.holiday.createMany({ data: fresh.map((h) => ({ ...h, userId: user.id })) });

  return { yearId, created, folderId, holidaysAdded: fresh.length, holidaysSkipped: holidays.length - fresh.length };
});
