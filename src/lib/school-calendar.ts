// Lettura del calendario scolastico ufficiale (testo estratto dal PDF del Cantone Ticino).
// Funzioni pure: il testo arriva già estratto, così si possono provare senza PDF.

import type { CalendarImportDTO } from "./types";

const MONTHS: Record<string, number> = {
  gennaio: 1, febbraio: 2, marzo: 3, aprile: 4, maggio: 5, giugno: 6,
  luglio: 7, agosto: 8, settembre: 9, ottobre: 10, novembre: 11, dicembre: 12,
};
const MONTH = `(${Object.keys(MONTHS).join("|")})`;
const WEEKDAY = "(?:lunedì|martedì|mercoledì|giovedì|venerdì|sabato|domenica)";

const iso = (y: number, m: number, d: number) => `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

/** Indirizzo del PDF ufficiale del Cantone Ticino per l'anno che inizia in `startYear`. */
export const ticinoCalendarUrl = (startYear: number) =>
  `https://m4.ti.ch/fileadmin/DECS/calendario_scolastico/Calendario_scolastico_${startYear}_${startYear + 1}.pdf`;

function normalize(text: string): string {
  return text
    // Punti elenco dei caratteri simbolo (es. U+F0B7 nei PDF fatti con Word) e simili.
    .replace(/[\uE000-\uF8FF•▪◦●]/g, " ")
    .replace(/[’`´]/g, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/–|—/g, "-")
    .replace(/1°/g, "1");
}

/** "vacanze autunnali" → "Vacanze autunnali" */
function label(raw: string): string {
  const s = raw.replace(/^[\s\-•·:]+|[\s:]+$/g, "").replace(/\s+/g, " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Anno scolastico e vacanze dal testo del calendario.
 * Riconosce:
 * - "le lezioni cominciano lunedì 31 agosto 2026" / "terminano mercoledì 16 giugno 2027"
 * - "vacanze di Natale: dal 24 dicembre 2026 al 6 gennaio 2027" (anche "dal 31 ottobre all'8 novembre 2026")
 * - "Martedì 8 dicembre 2026: Immacolata"
 * - "È inoltre giorno di vacanza venerdì 7 maggio 2027."
 */
export function parseSchoolCalendar(input: string): CalendarImportDTO {
  const text = normalize(input);
  const lines = text.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  const holidays: CalendarImportDTO["holidays"] = [];
  const warnings: string[] = [];
  let start: string | null = null;
  let end: string | null = null;

  const startRe = new RegExp(`lezioni\\s+(?:cominciano|iniziano)[^0-9]*?(\\d{1,2})\\s+${MONTH}\\s+(\\d{4})`, "i");
  const endRe = new RegExp(`lezioni\\s+(?:terminano|finiscono)[^0-9]*?(\\d{1,2})\\s+${MONTH}\\s+(\\d{4})`, "i");
  const rangeRe = new RegExp(
    `^(.*?)\\bdal(?:l')?\\s*(\\d{1,2})\\s+${MONTH}(?:\\s+(\\d{4}))?\\s+al(?:l')?\\s*(\\d{1,2})\\s+${MONTH}\\s+(\\d{4})`,
    "i",
  );
  const dayRe = new RegExp(`^(?:${WEEKDAY}\\s+)?(\\d{1,2})\\s+${MONTH}\\s+(\\d{4})\\s*:\\s*(.+)$`, "i");
  const extraRe = new RegExp(`giorn[oi] di vacanza\\s+(?:${WEEKDAY}\\s+)?(\\d{1,2})\\s+${MONTH}\\s+(\\d{4})`, "i");
  const anyDate = new RegExp(`\\b\\d{1,2}\\s+${MONTH}\\s+\\d{4}`, "i");

  for (const line of lines) {
    let m: RegExpMatchArray | null;
    if ((m = line.match(startRe))) {
      start = iso(+m[3], MONTHS[m[2].toLowerCase()], +m[1]);
    } else if ((m = line.match(endRe))) {
      end = iso(+m[3], MONTHS[m[2].toLowerCase()], +m[1]);
    } else if ((m = line.match(rangeRe))) {
      const [, name, d1, m1, y1, d2, m2, y2] = m;
      const endMonth = MONTHS[m2.toLowerCase()];
      const startMonth = MONTHS[m1.toLowerCase()];
      // "dal 24 dicembre al 6 gennaio 2027": l'inizio è nell'anno prima.
      const startYear = y1 ? +y1 : startMonth > endMonth ? +y2 - 1 : +y2;
      holidays.push({
        name: label(name) || "Vacanze",
        startDate: iso(startYear, startMonth, +d1),
        endDate: iso(+y2, endMonth, +d2),
      });
    } else if ((m = line.match(dayRe))) {
      const date = iso(+m[3], MONTHS[m[2].toLowerCase()], +m[1]);
      holidays.push({ name: label(m[4].replace(/\.$/, "")), startDate: date, endDate: date });
    } else if ((m = line.match(extraRe))) {
      const date = iso(+m[3], MONTHS[m[2].toLowerCase()], +m[1]);
      holidays.push({ name: "Giorno di vacanza", startDate: date, endDate: date });
    } else if (anyDate.test(line) && !/esami|presenza|osservazion/i.test(line)) {
      warnings.push(line);
    }
  }

  holidays.sort((a, b) => a.startDate.localeCompare(b.startDate));
  const year =
    start && end && end > start
      ? { name: `${start.slice(0, 4)}/${end.slice(2, 4)}`, startDate: start, endDate: end }
      : null;
  return { year, holidays, warnings };
}

/** Nome della cartella di un anno scolastico: "Anno 2027/2028". */
export function yearFolderName(year: { startDate: string; endDate: string }): string {
  return `Anno ${year.startDate.slice(0, 4)}/${year.endDate.slice(0, 4)}`;
}
