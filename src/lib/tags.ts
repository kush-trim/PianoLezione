// Etichette degli esercizi: quattro pronte (con il loro colore) e quelle libere.
// Funzioni pure: le usano il server (salvataggio, ricerca) e le pagine.

export const PRESET_TAGS = [
  { name: "Teoria", hint: "spiegazioni, riassunti, schemi", className: "bg-accent-soft text-accent" },
  { name: "Esercizi", hint: "da fare in classe o a casa", className: "bg-ok-soft text-ok" },
  { name: "Soluzioni", hint: "le soluzioni degli esercizi", className: "bg-warn-soft text-warn" },
  { name: "Extra", hint: "fuori programma, per gli allievi più veloci", className: "bg-danger-soft text-danger" },
] as const;

export const MAX_TAGS = 12;
export const MAX_TAG_LENGTH = 30;

export const tagKey = (t: string) => t.trim().toLocaleLowerCase("it");

/**
 * Pulisce un elenco di etichette: spazi in più tolti, doppioni tolti (senza badare alle
 * maiuscole), le etichette pronte scritte sempre allo stesso modo, al massimo MAX_TAGS.
 */
export function normalizeTags(input: readonly string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of input) {
    const clean = raw.replace(/\s+/g, " ").trim().slice(0, MAX_TAG_LENGTH).trim();
    if (!clean) continue;
    const key = tagKey(clean);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(PRESET_TAGS.find((p) => tagKey(p.name) === key)?.name ?? clean);
    if (out.length === MAX_TAGS) break;
  }
  return out;
}

/** Le etichette salvate nel database (array JSON); un valore rovinato vale come nessuna etichetta. */
export function parseTags(json: string | null | undefined): string[] {
  try {
    const v: unknown = JSON.parse(json ?? "[]");
    return Array.isArray(v) ? normalizeTags(v.filter((x): x is string => typeof x === "string")) : [];
  } catch {
    return [];
  }
}

/** Classi del colore: le etichette pronte hanno il loro, le altre sono neutre. */
export const tagClass = (t: string) => PRESET_TAGS.find((p) => tagKey(p.name) === tagKey(t))?.className ?? "bg-sunken text-ink";

/** Ordine di presentazione: prima quelle pronte (nel loro ordine), poi le altre in ordine alfabetico. */
export function sortTags(tags: readonly string[]): string[] {
  const rank = (t: string) => {
    const i = PRESET_TAGS.findIndex((p) => tagKey(p.name) === tagKey(t));
    return i === -1 ? PRESET_TAGS.length : i;
  };
  return [...tags].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b, "it"));
}
