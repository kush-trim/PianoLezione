// Assistente AI: scelta del fornitore e del modello con la chiave personale dell'utente.

import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogle } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import { APICallError, type LanguageModel } from "ai";
import { computeSchedule, planIntervals } from "./schedule";
import type { AiProvider, PlanDTO } from "./types";

export const PROVIDER_LABEL: Record<AiProvider, string> = {
  anthropic: "Claude (Anthropic)",
  google: "Gemini (Google)",
  openai: "OpenAI",
};

/** Modello proposto quando l'utente non ne ha scelto uno. Per Gemini e OpenAI si sceglie dall'elenco. */
export const DEFAULT_MODEL: Record<AiProvider, string> = {
  anthropic: "claude-opus-5-5",
  google: "",
  openai: "",
};

/** In sviluppo, AI_FAKE=1 sostituisce il fornitore con risposte finte: serve a provare il flusso senza chiave. */
export const fakeAi = () => process.env.AI_FAKE === "1" && process.env.NODE_ENV !== "production";

export function languageModel(provider: AiProvider, apiKey: string, model: string): LanguageModel {
  switch (provider) {
    case "anthropic":
      return createAnthropic({ apiKey })(model);
    case "google":
      return createGoogle({ apiKey })(model);
    case "openai":
      return createOpenAI({ apiKey })(model);
  }
}

const NOT_CHAT = /embed|tts|whisper|dall-e|image|audio|realtime|moderation|transcribe|instruct|babbage|davinci|aqa|imagen|veo/i;

/** I modelli disponibili per quella chiave, letti dal fornitore (così l'elenco non invecchia). */
export async function listModels(provider: AiProvider, apiKey: string): Promise<string[]> {
  const get = async (url: string, headers: Record<string, string>) => {
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(10_000) });
    if (res.status === 401 || res.status === 403) throw new Error("La chiave non è valida o non ha i permessi necessari.");
    if (!res.ok) throw new Error(`Il fornitore ha risposto con un errore (${res.status}).`);
    return res.json();
  };

  if (provider === "anthropic") {
    const data = await get("https://api.anthropic.com/v1/models?limit=100", {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    });
    return (data.data as { id: string }[]).map((m) => m.id);
  }
  if (provider === "openai") {
    const data = await get("https://api.openai.com/v1/models", { Authorization: `Bearer ${apiKey}` });
    return (data.data as { id: string }[])
      .map((m) => m.id)
      .filter((id) => !NOT_CHAT.test(id))
      .sort();
  }
  const data = await get("https://generativelanguage.googleapis.com/v1beta/models?pageSize=200", {
    "x-goog-api-key": apiKey,
  });
  return (data.models as { name: string; supportedGenerationMethods?: string[] }[])
    .filter((m) => m.supportedGenerationMethods?.includes("generateContent"))
    .map((m) => m.name.replace(/^models\//, ""))
    .filter((id) => !NOT_CHAT.test(id))
    .sort();
}

/** Messaggio per l'utente a partire da un errore del fornitore, senza dettagli tecnici inutili. */
export function aiErrorMessage(e: unknown): string {
  if (APICallError.isInstance(e)) {
    if (e.statusCode === 401 || e.statusCode === 403) return "La chiave API non è valida o non ha accesso a questo modello.";
    if (e.statusCode === 404) return "Il modello scelto non esiste più o non è disponibile per la tua chiave: cambialo nelle Impostazioni.";
    if (e.statusCode === 429) return "Hai raggiunto il limite di richieste o il credito del tuo account presso il fornitore.";
    if (e.statusCode && e.statusCode >= 500) return "Il fornitore dell'assistente ha un problema temporaneo. Riprova tra poco.";
    return `Il fornitore ha rifiutato la richiesta: ${e.message.slice(0, 200)}`;
  }
  return "L'assistente non ha risposto. Riprova.";
}

/** Le istruzioni per l'assistente: ruolo, regole del modello di piano, piano attuale. */
export function systemPrompt(
  plan: PlanDTO,
  verbs: { insegnamento: string[]; apprendimento: string[] },
  lessonMinutes: number,
): string {
  const schedule = computeSchedule(
    planIntervals(plan),
    plan.phases.map((p) => p.durationMin),
    plan.manualDuration,
  );
  const current = {
    titolo: plan.title,
    prerequisiti: plan.prerequisiti,
    traguardo: plan.traguardo,
    obiettiviInsegnamento: plan.obiettiviInsegnamento.length
      ? plan.obiettiviInsegnamento.map(({ verbo, testo }) => ({ verbo, testo }))
      : plan.obiettivoInsegnamento,
    obiettiviApprendimento: plan.obiettiviApprendimento.length
      ? plan.obiettiviApprendimento.map(({ verbo, testo }) => ({ verbo, testo }))
      : plan.obiettivoApprendimento,
    fasi: plan.phases.map((p) => ({
      nome: p.name,
      modalita: p.modality,
      durataMin: p.durationMin,
      obiettiviSpecifici: p.obiettiviSpecifici,
      descrizione: p.descrizione,
      prodottoAtteso: p.prodottoAtteso,
      materiale: p.materiale,
    })),
    verifica: plan.verifica,
  };
  const lesson = plan.slots.length
    ? `${plan.slots[0].subject}${plan.slots[0].className ? `, classe ${plan.slots[0].className}` : ""}`
    : "non collegata a una lezione dell'orario";

  return `Sei l'assistente di un'insegnante o di un insegnante che prepara un piano lezione con il modello "Alcuni aspetti del piano lezione" (SUPSI, Ticino). Lavori insieme a una persona competente: proponi, non decidi al suo posto. Rispondi in italiano, in modo breve e concreto.

Il piano ha queste parti: prerequisiti degli allievi; obiettivo d'insegnamento (che cosa fa il docente); traguardo di apprendimento del piano di studio a cui la lezione si riferisce; obiettivo d'apprendimento (che cosa sa fare l'allievo alla fine); articolazione operativa, cioè la sequenza delle fasi, ognuna con tempi, obiettivi specifici, descrizione, prodotto atteso (comportamenti osservabili degli allievi) e materiale; verifica dell'obiettivo (quali azioni dell'allievo mostrano che l'obiettivo è raggiunto).

Regole da rispettare quando proponi contenuti:
- Gli obiettivi si scrivono con soggetto fisso e un verbo dell'elenco. Usa solo questi verbi, scritti esattamente così.
  Obiettivo d'insegnamento ("Il docente …"): ${verbs.insegnamento.join(", ") || "(nessun verbo in elenco)"}.
  Obiettivo d'apprendimento ("L'allievo …"): ${verbs.apprendimento.join(", ") || "(nessun verbo in elenco)"}.
  Nel campo "testo" metti il resto della frase, senza ripetere soggetto e verbo.
- Durata prevista della lezione: ${schedule.available ?? "non indicata"} minuti (un'ora di lezione dura ${lessonMinutes} minuti). La somma delle durate delle fasi deve dare questa durata, con durate multiple di 5 minuti. Se l'insegnante chiede esplicitamente di sforare, puoi farlo e lo dici.
- Il codice del traguardo di apprendimento (per esempio MAT.III.GM.8.EA.1) proponilo solo se te lo dà l'insegnante: non inventare codici del piano di studio.
- Non inventare materiali che l'insegnante non ha nominato se non sono di uso comune in classe (lavagna, schede, quaderno).

Quando l'insegnante ti chiede di scrivere o cambiare parti del piano, usa lo strumento proponi_modifiche con le sole parti che cambiano: l'insegnante vedrà la proposta e deciderà se applicarla. Le parti che includi sostituiscono per intero quelle attuali, quindi per ritoccare una fase rimanda tutte le fasi. Accompagna la proposta con una o due frasi che spiegano le scelte. Se ti manca un'informazione essenziale (argomento, classe, che cosa sanno già gli allievi), chiedila prima di proporre. Se la domanda è solo un parere o un chiarimento, rispondi senza usare lo strumento.

Lezione: ${lesson}${plan.date ? `, data ${plan.date}` : ""}.
Piano attuale (JSON):
${JSON.stringify(current, null, 1)}`;
}
