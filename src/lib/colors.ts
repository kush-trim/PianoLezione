// Colori per lezioni e cartelle. Valori espliciti (usati via style) così
// non dipendono dalle classi generate da Tailwind.

export const COLOR_NAMES = ["slate", "blue", "teal", "green", "amber", "orange", "rose", "violet"] as const;
export type ColorName = (typeof COLOR_NAMES)[number];

type Swatch = { bg: string; border: string; text: string; solid: string; label: string };

export const PALETTE: Record<ColorName, Swatch> = {
  slate: { bg: "#eceef0", border: "#c3c9cf", text: "#2c353d", solid: "#5b6770", label: "Grigio" },
  blue: { bg: "#e1ecfa", border: "#a9c6ee", text: "#143f73", solid: "#2f6fc0", label: "Blu" },
  teal: { bg: "#d9eeeb", border: "#9bcdc6", text: "#0c4a4a", solid: "#16807d", label: "Verde acqua" },
  green: { bg: "#e0f0dc", border: "#a9d19f", text: "#23521a", solid: "#3f8a2f", label: "Verde" },
  amber: { bg: "#fbefc9", border: "#e6cb74", text: "#614400", solid: "#b88a00", label: "Giallo" },
  orange: { bg: "#fde6d3", border: "#f0b78a", text: "#6e3408", solid: "#cf6a1d", label: "Arancione" },
  rose: { bg: "#fbe0e4", border: "#eda9b4", text: "#74162a", solid: "#c23a55", label: "Rosa" },
  violet: { bg: "#ebe3f8", border: "#c3aee8", text: "#3f2378", solid: "#7450c4", label: "Viola" },
};

export const swatch = (name: string): Swatch => PALETTE[name as ColorName] ?? PALETTE.slate;
