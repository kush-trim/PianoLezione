import { requireUser } from "@/lib/auth";
import { encryptJson } from "@/lib/crypto";
import { db } from "@/lib/db";
import { notFound, route } from "@/lib/http";
import { forgetCalendar } from "@/lib/ical";
import { ensureSettings, readCalendars, toSettingsDTO } from "@/lib/settings";

export const DELETE = route<{ id: string }>(async (_req, { id }) => {
  const user = await requireUser({ sessionOnly: true });
  const settings = await ensureSettings(user.id);
  const calendars = readCalendars(settings);
  const removed = calendars.find((c) => c.id === id);
  if (!removed) throw notFound();
  forgetCalendar(removed.url);
  const updated = await db.userSettings.update({
    where: { userId: user.id },
    data: { calendarsEnc: encryptJson(calendars.filter((c) => c.id !== id)) },
  });
  return toSettingsDTO(updated);
});
