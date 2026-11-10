// Funzioni condivise tra client e server (nessuna dipendenza dal database).

import type { Obiettivo, SlotDTO, VerbKind } from "./types";
import { toMin } from "./schedule";

export const WEEKDAYS = ["Lunedì", "Martedì", "Mercoledì", "Giovedì", "Venerdì", "Sabato", "Domenica"];
export const WEEKDAYS_SHORT = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"];

/** Divide il testo "Materiale" di una fase nelle singole voci. */
export function splitMaterials(text: string): string[] {
  return text
    .split(/[\n,;]+/)
    .map((s) => s.trim().replace(/^[-•]\s*/, ""))
    .filter(Boolean);
}

/** "Ev. Allegati" generato dai materiali della tabella, senza doppioni. */
export function computeAllegati(phases: { materiale: string }[]): string {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of phases) {
    for (const m of splitMaterials(p.materiale)) {
      const key = m.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(m.charAt(0).toUpperCase() + m.slice(1));
    }
  }
  return out.join("\n");
}

// --- Date (sempre come stringhe "YYYY-MM-DD", senza fusi orari) ---

export function parseDate(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function formatDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function addDays(s: string, n: number): string {
  const d = parseDate(s);
  d.setDate(d.getDate() + n);
  return formatDate(d);
}

/** 1 = lunedì ... 7 = domenica */
export function weekdayOf(s: string): number {
  return ((parseDate(s).getDay() + 6) % 7) + 1;
}

export function mondayOf(s: string): string {
  return addDays(s, 1 - weekdayOf(s));
}

export function today(): string {
  return formatDate(new Date());
}

export function humanDate(s: string, opts: { weekday?: boolean; year?: boolean } = {}): string {
  return parseDate(s).toLocaleDateString("it-CH", {
    weekday: opts.weekday ? "long" : undefined,
    day: "numeric",
    month: "long",
    year: opts.year === false ? undefined : "numeric",
  });
}

/**
 * Lezione doppia: partendo da uno slot, aggiunge quelli consecutivi dello
 * stesso giorno con stessa materia e classe (pausa massima 30').
 */
export function consecutiveSlots(slot: SlotDTO, all: SlotDTO[], maxGap = 30): SlotDTO[] {
  const same = all
    .filter(
      (s) => s.weekday === slot.weekday && s.subject === slot.subject && s.className === slot.className,
    )
    .sort((a, b) => toMin(a.startTime) - toMin(b.startTime));
  const i = same.findIndex((s) => s.id === slot.id);
  let lo = i;
  let hi = i;
  while (lo > 0 && toMin(same[lo].startTime) - toMin(same[lo - 1].endTime) <= maxGap) lo--;
  while (hi < same.length - 1 && toMin(same[hi + 1].startTime) - toMin(same[hi].endTime) <= maxGap) hi++;
  return same.slice(lo, hi + 1);
}

// --- Obiettivi strutturati ---

export const SUBJECT: Record<VerbKind, string> = {
  insegnamento: "Il docente",
  apprendimento: "L’allievo",
};

/** Il testo degli obiettivi come compare nel piano: una riga per obiettivo. */
export function objectivesText(kind: VerbKind, items: Obiettivo[]): string {
  return items
    .filter((o) => o.verbo.trim() || o.testo.trim())
    .map((o) => `- ${[SUBJECT[kind], o.verbo.trim(), o.testo.trim()].filter(Boolean).join(" ")}`)
    .join("\n");
}
