import { describe, expect, it } from "vitest";
import { COLOR_NAMES, LIGHT_SWATCHES } from "./colors";
import { contrastRatio, deriveTheme, isHex, PRESETS, presetVars, resolveTheme, themeCss } from "./theme";

const BASE = [
  "paper", "surface", "sunken", "ink", "muted", "line", "line-strong", "accent", "accent-hover", "accent-soft",
  "on-accent", "warn", "warn-soft", "danger", "danger-soft", "on-danger", "ok", "ok-soft",
];
const ALL = [...BASE, ...COLOR_NAMES.flatMap((n) => ["bg", "border", "text", "solid"].map((k) => `sw-${n}-${k}`))];

describe("temi", () => {
  it("ci sono almeno 5 temi pronti, chiari e scuri, con id diversi", () => {
    expect(PRESETS.length).toBeGreaterThanOrEqual(5);
    expect(new Set(PRESETS.map((p) => p.id)).size).toBe(PRESETS.length);
    expect(PRESETS.some((p) => p.key.scheme === "light")).toBe(true);
    expect(PRESETS.some((p) => p.key.scheme === "dark")).toBe(true);
  });

  for (const preset of PRESETS) {
    describe(preset.name, () => {
      const { colors } = presetVars(preset);

      it("ha tutte le variabili, in esadecimale", () => {
        for (const name of ALL) expect(isHex(colors[name]), name).toBe(true);
      });

      it("è leggibile", () => {
        for (const bg of ["paper", "surface"]) {
          expect(contrastRatio(colors.ink, colors[bg]), `ink/${bg}`).toBeGreaterThanOrEqual(7);
          expect(contrastRatio(colors.muted, colors[bg]), `muted/${bg}`).toBeGreaterThanOrEqual(4.5);
          expect(contrastRatio(colors.accent, colors[bg]), `accent/${bg}`).toBeGreaterThanOrEqual(4.5);
          for (const s of ["warn", "danger", "ok"]) {
            expect(contrastRatio(colors[s], colors[bg]), `${s}/${bg}`).toBeGreaterThanOrEqual(4.5);
          }
        }
        expect(contrastRatio(colors["on-accent"], colors.accent)).toBeGreaterThanOrEqual(4.5);
        expect(contrastRatio(colors.accent, colors["accent-soft"])).toBeGreaterThanOrEqual(4.5);
        for (const n of COLOR_NAMES) {
          expect(contrastRatio(colors[`sw-${n}-text`], colors[`sw-${n}-bg`]), n).toBeGreaterThanOrEqual(4.5);
        }
      });
    });
  }

  it("Carta ha i colori originali dell'app", () => {
    const { colors, scheme } = resolveTheme("carta", "");
    expect(scheme).toBe("light");
    expect(colors).toMatchObject({ paper: "#f6f4ee", surface: "#ffffff", ink: "#1d2327", accent: "#0e5a5a", "warn-soft": "#fbefd6" });
    expect(colors["sw-blue-bg"]).toBe(LIGHT_SWATCHES.blue.bg);
  });

  it("un tema sconosciuto o un personalizzato rotto tornano a Carta", () => {
    const carta = resolveTheme("carta", "");
    expect(resolveTheme("boh", "")).toEqual(carta);
    expect(resolveTheme("custom", "{rotto")).toEqual(carta);
    expect(resolveTheme("custom", JSON.stringify({ scheme: "dark", paper: "red", ink: "#ffffff", accent: "#00ff00" }))).toEqual(carta);
  });

  it("il personalizzato si calcola dai tre colori chiave", () => {
    const custom = { scheme: "dark" as const, paper: "#101010", ink: "#f0f0f0", accent: "#ff8800" };
    const vars = resolveTheme("custom", JSON.stringify(custom));
    expect(vars).toEqual(deriveTheme(custom));
    expect(vars.scheme).toBe("dark");
    expect(vars.colors["on-accent"]).toBe("#15181b");
  });

  it("muted resta leggibile anche con colori chiave poco contrastati", () => {
    const { colors } = deriveTheme({ scheme: "light", paper: "#dddddd", ink: "#555555", accent: "#3366cc" });
    expect(contrastRatio(colors.muted, colors.surface)).toBeGreaterThanOrEqual(4.5);
  });
});

describe("themeCss", () => {
  it("contiene solo variabili valide, vale solo per lo schermo", () => {
    const css = themeCss({ scheme: "dark", colors: { paper: "#000000", "x;}body{": "#ffffff", ink: "red" } });
    expect(css).toBe("@media screen{:root:root{--paper:#000000;color-scheme:dark}}");
  });
});
