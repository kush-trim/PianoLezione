import { simulateReadableStream, streamText, type LanguageModel } from "ai";
import { requireUser } from "@/lib/auth";
import { aiErrorMessage, DEFAULT_MODEL, fakeAi, languageModel, systemPrompt } from "@/lib/ai";
import { proposalSchema, sanitizeProposal } from "@/lib/ai-proposal";
import { db } from "@/lib/db";
import { ApiError, readJson, route } from "@/lib/http";
import { getPlan } from "@/lib/plans";
import { ensureSettings, readAiKeys, toSettingsDTO } from "@/lib/settings";
import { chatSchema } from "@/lib/validation";

/** Modello finto per lo sviluppo (AI_FAKE=1): risponde sempre con un testo e una proposta. */
async function fakeModel(): Promise<LanguageModel> {
  const { MockLanguageModelV4 } = await import("ai/test");
  const usage = {
    inputTokens: { total: 1, noCache: 1, cacheRead: undefined, cacheWrite: undefined },
    outputTokens: { total: 1, text: 1, reasoning: undefined },
  };
  return new MockLanguageModelV4({
    doStream: async () => ({
      stream: simulateReadableStream({
        chunkDelayInMs: 30,
        chunks: [
          { type: "text-start", id: "t1" },
          { type: "text-delta", id: "t1", delta: "Ecco una proposta di prova: " },
          { type: "text-delta", id: "t1", delta: "tre fasi e un obiettivo per parte." },
          { type: "text-end", id: "t1" },
          {
            type: "tool-call",
            toolCallId: "call-1",
            toolName: "proponi_modifiche",
            input: JSON.stringify({
              sintesi: "Struttura di prova in tre fasi",
              obiettiviInsegnamento: [{ verbo: "presenta", testo: "il concetto di area" }],
              obiettiviApprendimento: [{ verbo: "verbo-non-in-elenco", testo: "l'area di un rettangolo" }],
              fasi: [
                { nome: "Introduzione", modalita: "frontale", durataMin: 10, obiettiviSpecifici: "", descrizione: "Lancio del problema", prodottoAtteso: "", materiale: "Lavagna" },
                { nome: "Attività a coppie", modalita: "", durataMin: 25, obiettiviSpecifici: "", descrizione: "Misurazione", prodottoAtteso: "", materiale: "Schede" },
                { nome: "Conclusione", modalita: "dialogata", durataMin: 10, obiettiviSpecifici: "", descrizione: "Sintesi", prodottoAtteso: "", materiale: "" },
              ],
            }),
          },
          { type: "finish", finishReason: { unified: "tool-calls", raw: undefined }, logprobs: undefined, usage },
        ],
      }),
    }),
  });
}

// La risposta è un flusso di righe JSON: { t: "text" | "proposal" | "error", v }.
export const POST = route(async (req) => {
  const user = await requireUser();
  const { planId, messages } = chatSchema.parse(await readJson(req));
  const settingsRow = await ensureSettings(user.id);
  const settings = toSettingsDTO(settingsRow);

  let model: LanguageModel;
  if (fakeAi()) {
    model = await fakeModel();
  } else {
    const provider = settings.aiProvider;
    const key = provider ? readAiKeys(settingsRow)[provider] : undefined;
    if (!provider || !key) throw new ApiError(400, "Per usare l'assistente imposta fornitore e chiave nelle Impostazioni.");
    const modelId = settings.aiModel || DEFAULT_MODEL[provider];
    if (!modelId) throw new ApiError(400, "Scegli un modello nelle Impostazioni.");
    model = languageModel(provider, key, modelId);
  }

  const [plan, verbRows] = await Promise.all([
    getPlan(user.id, planId),
    db.verb.findMany({ where: { userId: user.id }, orderBy: { order: "asc" } }),
  ]);
  const verbs = {
    insegnamento: verbRows.filter((v) => v.kind === "insegnamento").map((v) => v.text),
    apprendimento: verbRows.filter((v) => v.kind === "apprendimento").map((v) => v.text),
  };

  const result = streamText({
    model,
    system: systemPrompt(plan, verbs, settings.lessonMinutes),
    messages,
    maxOutputTokens: 16000,
    tools: {
      // Senza `execute`: la proposta torna al browser, dove l'insegnante decide se applicarla.
      proponi_modifiche: {
        description:
          "Propone modifiche al piano lezione. L'insegnante le vede e decide se applicarle. Includi solo le parti che cambiano.",
        inputSchema: proposalSchema,
      },
    },
  });

  const encoder = new TextEncoder();
  const line = (t: string, v: unknown) => encoder.encode(JSON.stringify({ t, v }) + "\n");
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const part of result.stream) {
          if (part.type === "text-delta") controller.enqueue(line("text", part.text));
          else if (part.type === "tool-call" && part.toolName === "proponi_modifiche") {
            const parsed = proposalSchema.safeParse(part.input);
            if (parsed.success) controller.enqueue(line("proposal", sanitizeProposal(parsed.data, verbs)));
          } else if (part.type === "error") {
            console.error("assistente:", part.error);
            controller.enqueue(line("error", aiErrorMessage(part.error)));
          }
        }
      } catch (e) {
        console.error("assistente:", e);
        controller.enqueue(line("error", aiErrorMessage(e)));
      }
      controller.close();
    },
  });
  return new Response(body, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" },
  });
});
