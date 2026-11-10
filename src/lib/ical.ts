// Lettura dei calendari esterni in formato iCal (es. l'indirizzo segreto di Google Calendar).
// Il parser copre ciò che serve qui: eventi singoli, di più giorni e ricorrenze semplici.

import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { addDays, formatDate, parseDate } from "./plan-utils";

export type IcalEvent = {
  title: string;
  startDate: string; // "YYYY-MM-DD"
  endDate: string; // incluso
  startTime: string | null; // null = giornata intera
  endTime: string | null;
  rrule: Record<string, string> | null;
  exdates: string[];
};

export type IcalOccurrence = { title: string; date: string; startTime: string | null; endTime: string | null };

const TZ = "Europe/Zurich";

function unescapeText(s: string): string {
  return s.replace(/\\n/gi, " ").replace(/\\([,;\\])/g, "$1").trim();
}

/** Converte un istante UTC in data e ora locali (fuso svizzero). */
function utcToLocal(y: number, mo: number, d: number, h: number, mi: number): { date: string; time: string } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(Date.UTC(y, mo - 1, d, h, mi)));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  return { date: `${get("year")}-${get("month")}-${get("day")}`, time: `${get("hour")}:${get("minute")}` };
}

function parseDateValue(value: string): { date: string; time: string | null } | null {
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/.exec(value.trim());
  if (!m) return null;
  const [, y, mo, d, h, mi, , z] = m;
  if (h === undefined) return { date: `${y}-${mo}-${d}`, time: null };
  // Orario UTC: va riportato all'ora locale. Con TZID si tiene l'ora indicata.
  if (z) return utcToLocal(+y, +mo, +d, +h, +mi);
  return { date: `${y}-${mo}-${d}`, time: `${h}:${mi}` };
}

export function parseIcal(text: string): IcalEvent[] {
  const lines = text.replace(/\r?\n[ \t]/g, "").split(/\r?\n/);
  const events: IcalEvent[] = [];
  let cur: Record<string, string[]> | null = null;

  for (const line of lines) {
    if (line === "BEGIN:VEVENT") cur = {};
    else if (line === "END:VEVENT") {
      if (cur) {
        const ev = toEvent(cur);
        if (ev) events.push(ev);
      }
      cur = null;
    } else if (cur) {
      const colon = line.indexOf(":");
      if (colon < 0) continue;
      const name = line.slice(0, colon).split(";")[0].toUpperCase();
      (cur[name] ??= []).push(line.slice(colon + 1));
    }
  }
  return events;
}

function toEvent(props: Record<string, string[]>): IcalEvent | null {
  // Le modifiche a singole occorrenze di una serie non sono gestite: si salta la riga.
  if (props["RECURRENCE-ID"]) return null;
  if (props["STATUS"]?.[0]?.toUpperCase() === "CANCELLED") return null;
  const start = parseDateValue(props["DTSTART"]?.[0] ?? "");
  if (!start) return null;
  const end = parseDateValue(props["DTEND"]?.[0] ?? "");

  let endDate = end?.date ?? start.date;
  // Negli eventi di giornata intera la fine è esclusa.
  if (start.time === null && end && end.date > start.date) endDate = addDays(end.date, -1);
  if (endDate < start.date) endDate = start.date;

  const rruleRaw = props["RRULE"]?.[0];
  const rrule = rruleRaw
    ? Object.fromEntries(rruleRaw.split(";").map((p) => p.split("=").map((x) => x.toUpperCase()) as [string, string]))
    : null;
  const exdates = (props["EXDATE"] ?? [])
    .flatMap((v) => v.split(","))
    .map((v) => parseDateValue(v)?.date)
    .filter((d): d is string => !!d);

  return {
    title: unescapeText(props["SUMMARY"]?.[0] ?? "") || "(senza titolo)",
    startDate: start.date,
    endDate,
    startTime: start.time,
    endTime: start.time === null ? null : end && end.date === start.date ? end.time : "23:59",
    rrule,
    exdates,
  };
}

const BYDAY = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"];

/** Le date di inizio di un evento (anche ricorrente) che cadono entro `to`. */
function startDates(ev: IcalEvent, to: string): string[] {
  if (!ev.rrule) return [ev.startDate];
  const freq = ev.rrule["FREQ"];
  const interval = Math.max(1, Number(ev.rrule["INTERVAL"]) || 1);
  const count = Number(ev.rrule["COUNT"]) || Infinity;
  const until = parseDateValue(ev.rrule["UNTIL"] ?? "")?.date ?? "9999-12-31";
  const last = until < to ? until : to;
  const out: string[] = [];
  // COUNT conta anche le occorrenze poi escluse con EXDATE.
  let generated = 0;
  const push = (d: string) => {
    if (d < ev.startDate || generated >= count) return;
    generated++;
    if (d <= last && !ev.exdates.includes(d)) out.push(d);
  };

  if (freq === "WEEKLY") {
    const days = (ev.rrule["BYDAY"]?.split(",") ?? [])
      .map((d) => BYDAY.indexOf(d.slice(-2)))
      .filter((i) => i >= 0)
      .sort((a, b) => a - b);
    const start = parseDate(ev.startDate);
    const monday = addDays(ev.startDate, -((start.getDay() + 6) % 7));
    const offsets = days.length ? days : [(start.getDay() + 6) % 7];
    for (let w = 0, n = 0; n < 1500 && generated < count; w += interval, n++) {
      const weekStart = addDays(monday, w * 7);
      if (weekStart > last) break;
      for (const o of offsets) push(addDays(weekStart, o));
    }
    return out;
  }

  const base = parseDate(ev.startDate);
  for (let i = 0, n = 0; n < 3000 && generated < count; i += interval, n++) {
    const d = new Date(base);
    if (freq === "DAILY") d.setDate(base.getDate() + i);
    else if (freq === "MONTHLY") d.setMonth(base.getMonth() + i);
    else if (freq === "YEARLY") d.setFullYear(base.getFullYear() + i);
    else return [ev.startDate]; // frequenza non gestita: solo la prima occorrenza
    // Giorno inesistente in quel mese (es. 31): quell'occorrenza non c'è.
    if (freq !== "DAILY" && d.getDate() !== base.getDate()) continue;
    const s = formatDate(d);
    if (s > last) break;
    push(s);
  }
  return out;
}

/** Gli eventi riportati ai singoli giorni dell'intervallo [from, to]. */
export function expandEvents(events: IcalEvent[], from: string, to: string): IcalOccurrence[] {
  const out: IcalOccurrence[] = [];
  for (const ev of events) {
    const span = Math.round((parseDate(ev.endDate).getTime() - parseDate(ev.startDate).getTime()) / 86_400_000);
    for (const start of startDates(ev, to)) {
      for (let i = 0; i <= Math.min(span, 400); i++) {
        const date = addDays(start, i);
        if (date < from || date > to) continue;
        out.push({ title: ev.title, date, startTime: ev.startTime, endTime: ev.endTime });
      }
    }
  }
  return out.sort((a, b) => (a.date + (a.startTime ?? "")).localeCompare(b.date + (b.startTime ?? "")));
}

// --- Scaricamento ---

const MAX_BYTES = 3_000_000;
const CACHE_MS = 60 * 60_000;
const cache = new Map<string, { at: number; events: IcalEvent[] }>();

export function normalizeCalendarUrl(raw: string): string {
  const url = new URL(raw.trim().replace(/^webcal:\/\//i, "https://"));
  if (url.protocol !== "https:") throw new Error("Il link del calendario deve iniziare con https://");
  return url.toString();
}

function isPrivateAddress(ip: string): boolean {
  if (isIP(ip) === 4) {
    const [a, b] = ip.split(".").map(Number);
    return (
      a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224
    );
  }
  const v6 = ip.toLowerCase();
  if (v6.startsWith("::ffff:")) return isPrivateAddress(v6.slice(7));
  return v6 === "::" || v6 === "::1" || v6.startsWith("fc") || v6.startsWith("fd") || v6.startsWith("fe80");
}

/** Il server non deve poter essere usato per raggiungere indirizzi interni. */
async function assertPublicHost(url: URL) {
  if (url.protocol !== "https:") throw new Error("Sono ammessi solo indirizzi https");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  const addresses = isIP(host) ? [{ address: host }] : await lookup(host, { all: true });
  if (addresses.length === 0 || addresses.some((a) => isPrivateAddress(a.address))) {
    throw new Error("Indirizzo non ammesso: deve essere un sito pubblico");
  }
}

/**
 * Scarica un file da un indirizzo https pubblico: i reindirizzamenti si seguono a mano,
 * controllando ogni destinazione, e la dimensione è limitata.
 */
export async function fetchPublic(
  rawUrl: string,
  { accept, maxBytes = MAX_BYTES, what = "Il calendario" }: { accept: string; maxBytes?: number; what?: string },
): Promise<ArrayBuffer> {
  let url = new URL(rawUrl);
  let res: Response | null = null;
  for (let hop = 0; hop < 4; hop++) {
    await assertPublicHost(url);
    res = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(8000), headers: { Accept: accept } });
    if (res.status < 300 || res.status >= 400) break;
    const next = res.headers.get("location");
    if (!next) break;
    url = new URL(next, url);
    res = null;
  }
  if (!res || !res.ok) throw new Error(`${what} non risponde${res ? ` (errore ${res.status})` : ""}`);
  if (Number(res.headers.get("content-length") ?? 0) > maxBytes) throw new Error(`${what}: file troppo grande`);
  const buf = await res.arrayBuffer();
  if (buf.byteLength > maxBytes) throw new Error(`${what}: file troppo grande`);
  return buf;
}

export async function fetchCalendar(rawUrl: string): Promise<IcalEvent[]> {
  const cached = cache.get(rawUrl);
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.events;

  const buf = await fetchPublic(normalizeCalendarUrl(rawUrl), { accept: "text/calendar" });
  const text = new TextDecoder().decode(buf);
  if (!text.includes("BEGIN:VCALENDAR")) throw new Error("Il link non è un calendario iCal");

  const events = parseIcal(text);
  cache.set(rawUrl, { at: Date.now(), events });
  return events;
}

export function forgetCalendar(rawUrl: string) {
  cache.delete(rawUrl);
}
