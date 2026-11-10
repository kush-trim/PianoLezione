import { requireUser } from "@/lib/auth";
import { DEFAULT_MODEL, listModels } from "@/lib/ai";
import { ApiError, route } from "@/lib/http";
import { AI_PROVIDERS, ensureSettings, readAiKeys } from "@/lib/settings";
import type { AiProvider } from "@/lib/types";

// GET /api/ai/models?provider=anthropic → i modelli utilizzabili con la chiave salvata.
export const GET = route(async (req) => {
  const user = await requireUser();
  const provider = new URL(req.url).searchParams.get("provider") as AiProvider;
  if (!AI_PROVIDERS.includes(provider)) throw new ApiError(400, "Fornitore non valido");
  const key = readAiKeys(await ensureSettings(user.id))[provider];
  if (!key) throw new ApiError(400, "Salva prima la chiave di questo fornitore");
  try {
    return { models: await listModels(provider, key), suggested: DEFAULT_MODEL[provider] };
  } catch (e) {
    throw new ApiError(502, e instanceof Error ? e.message : "Impossibile leggere l'elenco dei modelli");
  }
});
