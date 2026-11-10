import { randomUUID } from "node:crypto";
import { requireUser } from "@/lib/auth";
import { encryptJson } from "@/lib/crypto";
import { db } from "@/lib/db";
import { ApiError, readJson, route } from "@/lib/http";
import { fetchCalendar, normalizeCalendarUrl } from "@/lib/ical";
import { ensureSettings, readCalendars, toSettingsDTO } from "@/lib/settings";
import { calendarSchema } from "@/lib/validation";

// Aggiunge un calendario esterno. Il link viene provato subito, così un indirizzo
// sbagliato si scopre qui e non più tardi nella vista della settimana.
export const POST = route(async (req) => {
  const user = await requireUser({ sessionOnly: true });
  const data = calendarSchema.parse(await readJson(req));
  const settings = await ensureSettings(user.id);
  const calendars = readCalendars(settings);
  if (calendars.length >= 5) throw new ApiError(400, "Puoi collegare al massimo 5 calendari");

  let url: string;
  try {
    url = normalizeCalendarUrl(data.url);
    await fetchCalendar(url);
  } catch (e) {
    throw new ApiError(400, e instanceof Error ? e.message : "Calendario non leggibile");
  }

  calendars.push({ id: randomUUID(), name: data.name, url, asHolidays: data.asHolidays });
  const updated = await db.userSettings.update({
    where: { userId: user.id },
    data: { calendarsEnc: encryptJson(calendars) },
  });
  return toSettingsDTO(updated);
});
