// Impostazioni dell'utente, lato server.

import { defaultSchoolYear } from "./calendar";
import { decryptJson } from "./crypto";
import { db } from "./db";
import { today } from "./plan-utils";
import type { AiProvider, SettingsDTO, VerbKind } from "./types";

export type CalendarConfig = { id: string; name: string; url: string; asHolidays: boolean };
export type AiKeys = Partial<Record<AiProvider, string>>;

export const AI_PROVIDERS: AiProvider[] = ["anthropic", "google", "openai"];

// Verbi di partenza, alla terza persona: si leggono dopo "Il docente" / "L'allievo".
const DEFAULT_VERBS: Record<VerbKind, string[]> = {
  insegnamento: [
    "presenta", "introduce", "spiega", "mostra", "illustra", "propone", "guida", "stimola",
    "accompagna", "favorisce", "fa scoprire", "mette a confronto", "riprende", "consolida",
    "sintetizza", "verifica", "valuta",
  ],
  apprendimento: [
    "riconosce", "individua", "descrive", "spiega", "confronta", "classifica", "calcola",
    "misura", "stima", "applica", "utilizza", "risolve", "rappresenta", "costruisce",
    "formula", "analizza", "argomenta", "giustifica", "collabora", "comunica", "valuta",
  ],
};

/**
 * Le impostazioni dell'utente; la prima volta crea anche i verbi di partenza e
 * l'anno scolastico in corso (vale anche per gli account nati prima di questa funzione).
 */
export async function ensureSettings(userId: string) {
  const existing = await db.userSettings.findUnique({ where: { userId } });
  if (existing?.seeded) return existing;

  return db.$transaction(async (tx) => {
    const settings = await tx.userSettings.upsert({
      where: { userId },
      create: { userId, seeded: true },
      update: { seeded: true },
    });
    if ((await tx.verb.count({ where: { userId } })) === 0) {
      await tx.verb.createMany({
        data: (Object.keys(DEFAULT_VERBS) as VerbKind[]).flatMap((kind) =>
          DEFAULT_VERBS[kind].map((text, order) => ({ userId, kind, text, order })),
        ),
      });
    }
    if ((await tx.schoolYear.count({ where: { userId } })) === 0) {
      await tx.schoolYear.create({ data: { userId, ...defaultSchoolYear(today()) } });
    }
    return settings;
  });
}

export function readCalendars(settings: { calendarsEnc: string }): CalendarConfig[] {
  return decryptJson<CalendarConfig[]>(settings.calendarsEnc, []);
}

export function readAiKeys(settings: { aiKeysEnc: string }): AiKeys {
  return decryptJson<AiKeys>(settings.aiKeysEnc, {});
}

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return "";
  }
}

/** Ciò che il browser può vedere: mai le chiavi, mai i link completi dei calendari. */
export function toSettingsDTO(settings: Awaited<ReturnType<typeof ensureSettings>>): SettingsDTO {
  const keys = readAiKeys(settings);
  return {
    lessonMinutes: settings.lessonMinutes,
    defaultHours: settings.defaultHours,
    aiProvider: (AI_PROVIDERS as string[]).includes(settings.aiProvider) ? (settings.aiProvider as AiProvider) : "",
    aiModel: settings.aiModel,
    aiKeys: { anthropic: !!keys.anthropic, google: !!keys.google, openai: !!keys.openai },
    calendars: readCalendars(settings).map((c) => ({
      id: c.id,
      name: c.name,
      host: hostOf(c.url),
      asHolidays: c.asHolidays,
    })),
  };
}
