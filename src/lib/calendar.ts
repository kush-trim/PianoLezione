// Regole del calendario scolastico: funzioni pure, condivise tra client e server.

import { addDays, mondayOf, weekdayOf } from "./plan-utils";
import { toMin } from "./schedule";
import type { ClassRemaining, EventDTO, ExceptionDTO, Occurrence, SlotDTO } from "./types";

/** La lezione ricorrente vale in questa data? (giorno della settimana + periodo di validità) */
export function slotValidOn(slot: SlotDTO, date: string): boolean {
  if (slot.weekday !== weekdayOf(date)) return false;
  if (slot.validFrom && date < slot.validFrom) return false;
  if (slot.validTo && date > slot.validTo) return false;
  return true;
}

/** Le lezioni di un giorno, con le modifiche valide solo per quella data già applicate. */
export function occurrencesOn(date: string, slots: SlotDTO[], exceptions: ExceptionDTO[]): Occurrence[] {
  return slots
    .filter((s) => slotValidOn(s, date))
    .map((slot): Occurrence => {
      const ex = exceptions.find((e) => e.slotId === slot.id && e.date === date) ?? null;
      const modified = ex?.kind === "modificata";
      return {
        slot,
        date,
        startTime: (modified && ex.startTime) || slot.startTime,
        endTime: (modified && ex.endTime) || slot.endTime,
        room: (modified && ex.room) || slot.room,
        cancelled: ex?.kind === "annullata",
        modified,
        note: ex?.note ?? "",
      };
    })
    .sort((a, b) => toMin(a.startTime) - toMin(b.startTime));
}

type CancellingEvent = Pick<EventDTO, "date" | "startTime" | "endTime" | "className" | "cancelsLessons" | "title">;

const sameClass = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** L'evento (gita, giornata speciale…) per cui questa lezione non si tiene, se c'è. */
export function cancellingEvent<E extends CancellingEvent>(occ: Occurrence, events: E[]): E | null {
  return (
    events.find(
      (e) =>
        e.cancelsLessons &&
        e.date === occ.date &&
        (!e.className.trim() || sameClass(e.className, occ.slot.className)) &&
        // Giornata intera, oppure orari che si sovrappongono alla lezione.
        (!e.startTime || !e.endTime || (e.startTime < occ.endTime && e.endTime > occ.startTime)),
    ) ?? null
  );
}

/**
 * Le lezioni di un giorno che vanno mostrate: nei giorni di vacanza non ce ne sono, e quelle
 * tolte da un evento della classe spariscono. Le lezioni annullate a mano restano (spente).
 */
export function schoolOccurrences(
  date: string,
  slots: SlotDTO[],
  exceptions: ExceptionDTO[],
  holidays: Set<string>,
  events: CancellingEvent[] = [],
): Occurrence[] {
  if (holidays.has(date)) return [];
  return occurrencesOn(date, slots, exceptions).filter((o) => !cancellingEvent(o, events));
}

/**
 * Lezioni fatte e rimaste nell'anno scolastico, per classe e materia, contando da `from` (incluso).
 * Non contano vacanze, lezioni annullate e lezioni tolte da un evento.
 */
export function remainingByClass(
  year: { startDate: string; endDate: string },
  from: string,
  slots: SlotDTO[],
  exceptions: ExceptionDTO[],
  holidays: Set<string>,
  events: CancellingEvent[],
  plans: { date: string | null; slotIds: string[] }[],
): { classes: ClassRemaining[]; schoolDaysLeft: number } {
  const planned = new Set(plans.flatMap((p) => (p.date ? p.slotIds.map((id) => `${p.date}|${id}`) : [])));
  const byKey = new Map<string, ClassRemaining & { days: Set<string> }>();
  let schoolDaysLeft = 0;

  for (let date = year.startDate; date <= year.endDate; date = addDays(date, 1)) {
    if (date >= from && weekdayOf(date) <= 5 && !holidays.has(date)) schoolDaysLeft++;
    for (const o of schoolOccurrences(date, slots, exceptions, holidays, events)) {
      if (o.cancelled) continue;
      const key = `${o.slot.className}|${o.slot.subject}`;
      let c = byKey.get(key);
      if (!c) {
        c = {
          className: o.slot.className, subject: o.slot.subject, color: o.slot.color,
          remaining: 0, remainingMin: 0, planned: 0, done: 0, daysLeft: 0, nextDate: null, days: new Set(),
        };
        byKey.set(key, c);
      }
      if (date < from) {
        c.done++;
        continue;
      }
      c.remaining++;
      c.remainingMin += toMin(o.endTime) - toMin(o.startTime);
      if (planned.has(`${date}|${o.slot.id}`)) c.planned++;
      c.days.add(date);
      c.nextDate ??= date;
    }
  }

  const classes = [...byKey.values()]
    .map(({ days, ...c }) => ({ ...c, daysLeft: days.size }))
    .sort((a, b) => a.className.localeCompare(b.className, "it", { numeric: true }) || a.subject.localeCompare(b.subject));
  return { classes, schoolDaysLeft };
}

export type YearWeek = {
  monday: string;
  /** Numero della settimana di scuola; null se è tutta di vacanza. */
  number: number | null;
  /** Nome della vacanza, se la settimana (lun–ven) è tutta di vacanza. */
  holiday: string | null;
};

/**
 * Le settimane di un anno scolastico. Sono numerate solo le settimane con almeno
 * un giorno di scuola (lun–ven, dentro l'anno e non di vacanza).
 */
export function yearWeeks(
  year: { startDate: string; endDate: string },
  holidays: { name: string; startDate: string; endDate: string }[],
): YearWeek[] {
  const holidayName = (d: string) => holidays.find((h) => d >= h.startDate && d <= h.endDate)?.name ?? null;
  const weeks: YearWeek[] = [];
  let n = 0;
  for (let monday = mondayOf(year.startDate); monday <= year.endDate; monday = addDays(monday, 7)) {
    const schoolDays = [0, 1, 2, 3, 4]
      .map((i) => addDays(monday, i))
      .filter((d) => d >= year.startDate && d <= year.endDate);
    const names = schoolDays.map(holidayName);
    const allHoliday = names.length > 0 && names.every(Boolean);
    weeks.push({
      monday,
      number: allHoliday || schoolDays.length === 0 ? null : ++n,
      holiday: allHoliday ? names[0] : null,
    });
  }
  return weeks;
}

/** L'anno scolastico che contiene la data; altrimenti il più vicino nel futuro, poi nel passato. */
export function yearFor<T extends { startDate: string; endDate: string }>(years: T[], date: string): T | null {
  const sorted = [...years].sort((a, b) => a.startDate.localeCompare(b.startDate));
  return (
    sorted.find((y) => date >= y.startDate && date <= y.endDate) ??
    sorted.find((y) => y.startDate > date) ??
    sorted[sorted.length - 1] ??
    null
  );
}

/** Anno scolastico proposto per una data: dal 1° settembre al 20 giugno. */
export function defaultSchoolYear(today: string): { name: string; startDate: string; endDate: string } {
  const y = Number(today.slice(0, 4));
  const start = today.slice(5) >= "07-15" ? y : y - 1;
  return {
    name: `${start}/${String(start + 1).slice(2)}`,
    startDate: `${start}-09-01`,
    endDate: `${start + 1}-06-20`,
  };
}
