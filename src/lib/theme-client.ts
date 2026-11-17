// Il tema nel browser. Il tema vero è nell'account (UserSettings); qui se ne
// tiene una copia (il CSS già pronto) in localStorage, che lo script in <head>
// del layout radice applica prima che la pagina compaia: niente colori sbagliati.

import type { SettingsDTO } from "./types";
import { resolveTheme, themeCss, type ThemeVars } from "./theme";

const STORAGE_KEY = "ps-theme";
const STYLE_ID = "ps-theme";

/** Lo script in <head>: rimette l'ultima copia salvata. Deve restare autonomo. */
export const THEME_BOOT_SCRIPT = `(function(){try{var c=localStorage.getItem(${JSON.stringify(STORAGE_KEY)});if(!c)return;var s=document.createElement("style");s.id=${JSON.stringify(STYLE_ID)};s.textContent=c;document.head.appendChild(s)}catch(e){}})()`;

export function themeFromSettings(s: Pick<SettingsDTO, "theme" | "customTheme">): ThemeVars {
  return resolveTheme(s.theme, s.customTheme ? JSON.stringify(s.customTheme) : "");
}

/** Mostra subito il tema; con save ne tiene la copia per i prossimi caricamenti. */
export function applyTheme(vars: ThemeVars, { save = true } = {}) {
  const css = themeCss(vars);
  let el = document.getElementById(STYLE_ID);
  if (!el) {
    el = document.createElement("style");
    el.id = STYLE_ID;
    document.head.appendChild(el);
  }
  el.textContent = css;
  if (!save) return;
  try {
    localStorage.setItem(STORAGE_KEY, css);
  } catch {
    // Senza localStorage il tema arriva comunque, solo un attimo dopo.
  }
}

/** All'uscita: il prossimo che accede da questo browser parte dal tema di base. */
export function forgetTheme() {
  document.getElementById(STYLE_ID)?.remove();
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // niente da fare
  }
}
