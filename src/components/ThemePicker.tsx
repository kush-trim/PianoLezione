"use client";

import { Check, Moon, Sun } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { api, errorMessage } from "@/lib/api";
import { COLOR_NAMES } from "@/lib/colors";
import {
  contrastRatio,
  CUSTOM_THEME,
  deriveTheme,
  findPreset,
  PRESETS,
  presetVars,
  type CustomTheme,
  type Scheme,
  type ThemeVars,
} from "@/lib/theme";
import { applyTheme } from "@/lib/theme-client";
import type { SettingsDTO } from "@/lib/types";
import { cx, useToast } from "./ui";

/** Una miniatura del tema, disegnata con i suoi colori (non con quelli in uso). */
function Preview({ vars }: { vars: ThemeVars }) {
  const c = vars.colors;
  return (
    <div className="flex h-20 overflow-hidden rounded-md border" style={{ background: c.paper, borderColor: c.line }} aria-hidden>
      <div className="w-1/4 border-r p-1.5" style={{ borderColor: c.line }}>
        <div className="mb-1 h-1.5 w-full rounded-full" style={{ background: c["accent-soft"] }} />
        <div className="mb-1 h-1.5 w-3/4 rounded-full" style={{ background: c.line }} />
        <div className="h-1.5 w-3/4 rounded-full" style={{ background: c.line }} />
      </div>
      <div className="flex-1 p-1.5">
        <div className="rounded border p-1.5" style={{ background: c.surface, borderColor: c.line }}>
          <div className="text-[11px] leading-none font-semibold" style={{ color: c.ink }}>
            Aa
          </div>
          <div className="mt-1 h-1 w-2/3 rounded-full" style={{ background: c.muted }} />
          <div className="mt-1.5 flex items-center gap-1">
            <span className="h-2.5 w-6 rounded-full" style={{ background: c.accent }} />
            {COLOR_NAMES.slice(1, 5).map((n) => (
              <span key={n} className="h-2.5 w-2.5 rounded-sm" style={{ background: c[`sw-${n}-bg`], outline: `1px solid ${c[`sw-${n}-border`]}` }} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function ThemeCard({ name, vars, active, onSelect }: { name: string; vars: ThemeVars; active: boolean; onSelect: () => void }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      onClick={onSelect}
      className={cx(
        "rounded-lg border p-1.5 text-left transition-colors",
        active ? "border-accent bg-accent-soft" : "border-line hover:border-line-strong",
      )}
    >
      <Preview vars={vars} />
      <span className="mt-1.5 flex items-center gap-1.5 px-0.5 text-[13px] font-medium">
        {vars.scheme === "dark" ? <Moon className="size-3.5 text-muted" aria-hidden /> : <Sun className="size-3.5 text-muted" aria-hidden />}
        {name}
        {active && <Check className="ml-auto size-3.5 text-accent" aria-label="in uso" />}
      </span>
    </button>
  );
}

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="flex items-center gap-2">
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 w-11 cursor-pointer rounded-md border border-line-strong bg-surface p-1"
      />
      <span>
        <span className="block text-[13px] font-medium">{label}</span>
        <span className="tabular block font-mono text-xs text-muted uppercase">{value}</span>
      </span>
    </label>
  );
}

/** Scelta del tema: i temi pronti, più uno personalizzato da tre colori. */
export function ThemePicker({ settings, onSaved }: { settings: SettingsDTO; onSaved: (s: SettingsDTO) => void }) {
  const toast = useToast();
  const [theme, setTheme] = useState(settings.theme);
  const [custom, setCustom] = useState<CustomTheme>(
    () => settings.customTheme ?? (findPreset(settings.theme) ?? PRESETS[0]).key,
  );
  const pending = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (pending.current) clearTimeout(pending.current);
  }, []);

  const save = (patch: { theme: string; customTheme?: CustomTheme }) =>
    api.put<SettingsDTO>("/api/settings", patch).then(onSaved, (e) => toast(errorMessage(e), "error"));

  function choosePreset(id: string) {
    const preset = findPreset(id);
    if (!preset) return;
    if (pending.current) clearTimeout(pending.current);
    setTheme(id);
    applyTheme(presetVars(preset));
    save({ theme: id });
  }

  /** Mostra subito il tema personalizzato; il salvataggio aspetta che i colori smettano di cambiare. */
  function pickCustom(next: CustomTheme, { wait = false } = {}) {
    setTheme(CUSTOM_THEME);
    setCustom(next);
    applyTheme(deriveTheme(next));
    if (pending.current) clearTimeout(pending.current);
    if (wait) pending.current = setTimeout(() => save({ theme: CUSTOM_THEME, customTheme: next }), 600);
    else save({ theme: CUSTOM_THEME, customTheme: next });
  }

  // Passando da chiaro a scuro (e viceversa) sfondo e testo si scambiano:
  // restano le tinte scelte, ma con la luminosità giusta.
  const setScheme = (scheme: Scheme) =>
    scheme !== custom.scheme && pickCustom({ ...custom, scheme, paper: custom.ink, ink: custom.paper });

  const customVars = deriveTheme(custom);
  const c = customVars.colors;
  const darkPaper = contrastRatio(c.paper, "#ffffff") > contrastRatio(c.paper, "#000000");
  const warnings = [
    contrastRatio(c.ink, c.paper) < 4.5 && "Il testo si legge male sullo sfondo: allontana di più i due colori.",
    contrastRatio(c.accent, c.surface) < 3 && "L’accento si distingue poco dallo sfondo.",
    custom.scheme === "dark" && !darkPaper && "Per un tema scuro lo sfondo dovrebbe essere scuro.",
    custom.scheme === "light" && darkPaper && "Per un tema chiaro lo sfondo dovrebbe essere chiaro.",
  ].filter(Boolean) as string[];

  return (
    <div>
      <div role="radiogroup" aria-label="Tema" className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
        {PRESETS.map((p) => (
          <ThemeCard key={p.id} name={p.name} vars={presetVars(p)} active={theme === p.id} onSelect={() => choosePreset(p.id)} />
        ))}
        <ThemeCard name="Personalizzato" vars={customVars} active={theme === CUSTOM_THEME} onSelect={() => pickCustom(custom)} />
      </div>

      {theme === CUSTOM_THEME && (
        <div className="mt-4 rounded-lg border border-line bg-paper p-4">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-4">
            <div role="radiogroup" aria-label="Chiaro o scuro" className="flex gap-1 rounded-lg bg-sunken p-1">
              {(
                [
                  ["light", "Chiaro", Sun],
                  ["dark", "Scuro", Moon],
                ] as const
              ).map(([key, label, Icon]) => (
                <button
                  key={key}
                  type="button"
                  role="radio"
                  aria-checked={custom.scheme === key}
                  onClick={() => setScheme(key)}
                  className={cx(
                    "inline-flex h-8 items-center gap-1.5 rounded-md px-3 font-medium transition-colors",
                    custom.scheme === key ? "bg-surface shadow-sm" : "text-muted hover:text-ink",
                  )}
                >
                  <Icon className="size-3.5" aria-hidden />
                  {label}
                </button>
              ))}
            </div>
            <ColorField label="Sfondo" value={custom.paper} onChange={(v) => pickCustom({ ...custom, paper: v }, { wait: true })} />
            <ColorField label="Testo" value={custom.ink} onChange={(v) => pickCustom({ ...custom, ink: v }, { wait: true })} />
            <ColorField label="Accento" value={custom.accent} onChange={(v) => pickCustom({ ...custom, accent: v }, { wait: true })} />
            <label className="flex items-center gap-2 text-[13px] text-muted">
              Riparti da
              <select
                value=""
                onChange={(e) => {
                  const p = findPreset(e.target.value);
                  if (p) pickCustom(p.key);
                }}
                className="h-8 rounded-md border border-line-strong bg-surface px-2 text-ink"
              >
                <option value="" disabled>
                  un tema pronto…
                </option>
                {PRESETS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <p className="mt-3 text-[13px] text-muted">Le altre sfumature (bordi, sfondi delle schede, colori delle lezioni) si calcolano da questi tre colori.</p>
          {warnings.length > 0 && (
            <ul className="mt-3 space-y-1 rounded-md bg-warn-soft px-3 py-2 text-[13px] text-warn">
              {warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
