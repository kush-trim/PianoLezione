// Dati di calendario dell'utente lato server: vacanze (a mano + calendari esterni) ed eventi esterni.

import { db } from "./db";
import { expandEvents, fetchCalendar } from "./ical";
import { addDays, parseDate } from "./plan-utils";
import { readCalendars } from "./settings";
import type { ExternalEvent } from "./types";

export type DayHoliday = { date: string; name: string };

/**
 * Vacanze ed eventi esterni dell'intervallo [from, to].
 * Un calendario che non risponde non blocca la pagina: finisce in `errors`.
 */
export async function loadCalendarRange(
  userId: string,
  settings: { calendarsEnc: string },
  from: string,
  to: string,
): Promise<{ holidays: DayHoliday[]; external: ExternalEvent[]; errors: string[] }> {
  const holidays: DayHoliday[] = [];
  const external: ExternalEvent[] = [];
  const errors: string[] = [];

  const manual = await db.holiday.findMany({
    where: { userId, startDate: { lte: to }, endDate: { gte: from } },
  });
  for (const h of manual) {
    const start = h.startDate < from ? from : h.startDate;
    const end = h.endDate > to ? to : h.endDate;
    const days = Math.round((parseDate(end).getTime() - parseDate(start).getTime()) / 86_400_000);
    for (let i = 0; i <= days; i++) holidays.push({ date: addDays(start, i), name: h.name });
  }

  await Promise.all(
    readCalendars(settings).map(async (cal) => {
      try {
        for (const o of expandEvents(await fetchCalendar(cal.url), from, to)) {
          // Nei calendari marcati "vacanze" gli eventi di giornata intera sono giorni senza scuola.
          if (cal.asHolidays && o.startTime === null) holidays.push({ date: o.date, name: o.title });
          else external.push({ ...o, calendar: cal.name });
        }
      } catch (e) {
        errors.push(`${cal.name}: ${e instanceof Error ? e.message : "non leggibile"}`);
      }
    }),
  );

  // Un solo nome per giorno: vince la vacanza inserita a mano.
  const seen = new Set<string>();
  const unique = holidays.filter((h) => (seen.has(h.date) ? false : (seen.add(h.date), true)));
  return { holidays: unique.sort((a, b) => a.date.localeCompare(b.date)), external, errors };
}
