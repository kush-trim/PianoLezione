// Temi dell'app: colori calcolati da pochi colori chiave (sfondo, testo, accento).
// Valgono sia per i temi pronti sia per quello personalizzato. Il risultato sono
// le variabili CSS che globals.css espone a Tailwind.

import { COLOR_NAMES, LIGHT_SWATCHES } from "./colors";

export type Scheme = "light" | "dark";

/** I colori chiave di un tema: tutto il resto si calcola. */
export type ThemeKey = { scheme: Scheme; paper: string; ink: string; accent: string };
export type CustomTheme = ThemeKey;

/** Variabili CSS (senza il prefisso "--") e chiaro/scuro. */
export type ThemeVars = { scheme: Scheme; colors: Record<string, string> };

export type Preset = { id: string; name: string; key: ThemeKey; overrides?: Record<string, string> };

export const PRESETS: Preset[] = [
  {
    id: "carta",
    name: "Carta",
    key: { scheme: "light", paper: "#f6f4ee", ink: "#1d2327", accent: "#0e5a5a" },
    // I colori originali dell'app, identici a prima dei temi.
    overrides: {
      surface: "#ffffff",
      sunken: "#efece4",
      muted: "#667078",
      line: "#dfdacd",
      "line-strong": "#c9c2b1",
      "accent-hover": "#0a4747",
      "accent-soft": "#dcebe8",
      "warn-soft": "#fbefd6",
      "danger-soft": "#fbe4e1",
      "ok-soft": "#dff1e4",
    },
  },
  { id: "salvia", name: "Salvia", key: { scheme: "light", paper: "#f0f3ec", ink: "#1f2a22", accent: "#3b6a3d" } },
  { id: "cielo", name: "Cielo", key: { scheme: "light", paper: "#f2f5f9", ink: "#1a2433", accent: "#285ca6" } },
  { id: "notte", name: "Notte", key: { scheme: "dark", paper: "#141a24", ink: "#e4e9f0", accent: "#7fb0f0" } },
  { id: "lavagna", name: "Lavagna", key: { scheme: "dark", paper: "#16231e", ink: "#e6efe9", accent: "#7cc7b0" } },
  { id: "grafite", name: "Grafite", key: { scheme: "dark", paper: "#18181a", ink: "#ececec", accent: "#e0a35c" } },
];

export const DEFAULT_THEME = "carta";
export const CUSTOM_THEME = "custom";
export const THEME_IDS = [...PRESETS.map((p) => p.id), CUSTOM_THEME] as const;

const HEX = /^#[0-9a-f]{6}$/i;
export const isHex = (s: unknown): s is string => typeof s === "string" && HEX.test(s);

// ---- Calcoli sui colori -------------------------------------------------

type Rgb = [number, number, number];

function toRgb(hex: string): Rgb {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function toHex([r, g, b]: Rgb): string {
  const c = (v: number) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, "0");
  return `#${c(r)}${c(g)}${c(b)}`;
}

/** a mescolato con b: t=0 → a, t=1 → b. */
export function mix(a: string, b: string, t: number): string {
  const x = toRgb(a);
  const y = toRgb(b);
  return toHex([0, 1, 2].map((i) => x[i] + (y[i] - x[i]) * t) as Rgb);
}

function luminance(hex: string): number {
  const [r, g, b] = toRgb(hex).map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Rapporto di contrasto WCAG, da 1 a 21. */
export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** Tra bianco e quasi-nero, il testo più leggibile sopra bg. */
function textOn(bg: string): string {
  return contrastRatio(bg, "#ffffff") >= contrastRatio(bg, "#15181b") ? "#ffffff" : "#15181b";
}

/** Sposta fg verso target finché non contrasta abbastanza con tutti gli sfondi. */
function ensureContrast(fg: string, bgs: string[], target: string, min = 4.5): string {
  const enough = (c: string) => bgs.every((bg) => contrastRatio(c, bg) >= min);
  let c = fg;
  for (let t = 0.05; !enough(c) && t <= 1; t += 0.05) c = mix(fg, target, t);
  return c;
}

// ---- Stati (avvisi, errori, conferme) -------------------------------------

const STATUS: Record<Scheme, { warn: string; danger: string; ok: string }> = {
  light: { warn: "#a15c00", danger: "#a3271f", ok: "#1f6b3a" },
  dark: { warn: "#e3ad55", danger: "#f08679", ok: "#71c98c" },
};

// I colori delle lezioni e delle cartelle: nei temi scuri si scuriscono
// partendo dallo sfondo, così stanno bene anche con i temi personalizzati.
function swatchVars(key: ThemeKey): Record<string, string> {
  const out: Record<string, string> = {};
  for (const name of COLOR_NAMES) {
    const s = LIGHT_SWATCHES[name];
    if (key.scheme === "light") {
      out[`sw-${name}-bg`] = s.bg;
      out[`sw-${name}-border`] = s.border;
      out[`sw-${name}-text`] = s.text;
      out[`sw-${name}-solid`] = s.solid;
    } else {
      out[`sw-${name}-bg`] = mix(key.paper, s.solid, 0.26);
      out[`sw-${name}-border`] = mix(key.paper, s.solid, 0.55);
      out[`sw-${name}-text`] = mix(s.solid, "#ffffff", 0.62);
      out[`sw-${name}-solid`] = s.solid;
    }
  }
  return out;
}

/** Tutte le variabili di un tema a partire dai suoi tre colori chiave. */
export function deriveTheme(key: ThemeKey): ThemeVars {
  const { scheme, paper, ink, accent } = key;
  const light = scheme === "light";
  const status = STATUS[scheme];
  const soft = light ? 0.13 : 0.2;

  const surface = light ? mix(paper, "#ffffff", 0.8) : mix(paper, ink, 0.05);
  const colors: Record<string, string> = {
    paper,
    surface,
    sunken: light ? mix(paper, ink, 0.035) : mix(paper, "#000000", 0.28),
    ink,
    muted: ensureContrast(mix(ink, paper, 0.42), [paper, surface], ink),
    line: mix(paper, ink, light ? 0.11 : 0.15),
    "line-strong": mix(paper, ink, light ? 0.2 : 0.27),
    accent,
    "accent-hover": light ? mix(accent, "#000000", 0.2) : mix(accent, "#ffffff", 0.18),
    "accent-soft": mix(paper, accent, light ? 0.14 : 0.22),
    "on-accent": textOn(accent),
    warn: status.warn,
    "warn-soft": mix(paper, status.warn, soft),
    danger: status.danger,
    "danger-soft": mix(paper, status.danger, soft),
    "on-danger": textOn(status.danger),
    ok: status.ok,
    "ok-soft": mix(paper, status.ok, soft),
    ...swatchVars(key),
  };
  return { scheme, colors };
}

export function presetVars(preset: Preset): ThemeVars {
  const vars = deriveTheme(preset.key);
  return { scheme: vars.scheme, colors: { ...vars.colors, ...preset.overrides } };
}

export const findPreset = (id: string) => PRESETS.find((p) => p.id === id);

/** Il tema personalizzato salvato (JSON), o null se manca o non è valido. */
export function parseCustomTheme(json: string): CustomTheme | null {
  try {
    const v = JSON.parse(json) as Partial<CustomTheme>;
    if ((v.scheme === "light" || v.scheme === "dark") && isHex(v.paper) && isHex(v.ink) && isHex(v.accent)) {
      return { scheme: v.scheme, paper: v.paper.toLowerCase(), ink: v.ink.toLowerCase(), accent: v.accent.toLowerCase() };
    }
  } catch {
    // JSON rotto: si torna al tema di partenza.
  }
  return null;
}

/** Il tema da mostrare; se qualcosa non torna, quello di partenza. */
export function resolveTheme(themeId: string, customJson: string): ThemeVars {
  if (themeId === CUSTOM_THEME) {
    const custom = parseCustomTheme(customJson);
    if (custom) return deriveTheme(custom);
  }
  return presetVars(findPreset(themeId) ?? PRESETS[0]);
}

/**
 * Il CSS del tema. Solo per lo schermo: in stampa restano i colori di base
 * (globals.css), che vanno bene sulla carta. :root:root vince su :root di
 * globals.css qualunque sia l'ordine dei fogli di stile. Contiene solo
 * nomi e colori esadecimali verificati.
 */
export function themeCss(vars: ThemeVars): string {
  const decls = Object.entries(vars.colors)
    .filter(([name, value]) => /^[a-z-]+$/.test(name) && isHex(value))
    .map(([name, value]) => `--${name}:${value}`);
  return `@media screen{:root:root{${decls.join(";")};color-scheme:${vars.scheme === "dark" ? "dark" : "light"}}}`;
}
