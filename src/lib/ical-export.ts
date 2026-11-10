// Scrittura di un calendario iCal (per abbonarsi all'orario da Google Calendar, Apple Calendario…).

export type FeedEvent = {
  uid: string;
  title: string;
  date: string; // "YYYY-MM-DD"
  /** Ultimo giorno (incluso) di un evento di più giorni senza orari. */
  lastDate?: string;
  startTime: string | null; // null = giornata intera
  endTime: string | null;
  location?: string;
  description?: string;
};

const TZ = "Europe/Zurich";

const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
const compact = (date: string) => date.replaceAll("-", "");
const stamp = (date: string, time: string) => `${compact(date)}T${time.replace(":", "")}00`;

function nextDay(date: string): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/** Le righe più lunghe di 75 byte vanno spezzate (RFC 5545). */
function fold(line: string): string {
  const out: string[] = [];
  let cur = "";
  for (const ch of line) {
    if (Buffer.byteLength(cur + ch) > 73) {
      out.push(cur);
      cur = " ";
    }
    cur += ch;
  }
  out.push(cur);
  return out.join("\r\n");
}

export function toIcal(name: string, events: FeedEvent[], now = new Date()): string {
  const dtstamp = now.toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//PianoStudio//IT",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${esc(name)}`,
    `X-WR-TIMEZONE:${TZ}`,
    "REFRESH-INTERVAL;VALUE=DURATION:PT1H",
  ];
  for (const e of events) {
    lines.push("BEGIN:VEVENT", `UID:${e.uid}`, `DTSTAMP:${dtstamp}`, `SUMMARY:${esc(e.title)}`);
    if (e.startTime && e.endTime) {
      lines.push(`DTSTART;TZID=${TZ}:${stamp(e.date, e.startTime)}`, `DTEND;TZID=${TZ}:${stamp(e.date, e.endTime)}`);
    } else {
      lines.push(`DTSTART;VALUE=DATE:${compact(e.date)}`, `DTEND;VALUE=DATE:${compact(nextDay(e.lastDate ?? e.date))}`);
    }
    if (e.location) lines.push(`LOCATION:${esc(e.location)}`);
    if (e.description) lines.push(`DESCRIPTION:${esc(e.description)}`);
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}
