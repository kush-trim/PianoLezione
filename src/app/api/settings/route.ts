import { requireUser } from "@/lib/auth";
import { encryptJson } from "@/lib/crypto";
import { db } from "@/lib/db";
import { readJson, route } from "@/lib/http";
import { ensureSettings, readAiKeys, toSettingsDTO } from "@/lib/settings";
import { settingsSchema } from "@/lib/validation";

export const GET = route(async () => {
  const user = await requireUser();
  return toSettingsDTO(await ensureSettings(user.id));
});

export const PUT = route(async (req) => {
  const user = await requireUser({ sessionOnly: true });
  const { aiKey, ...fields } = settingsSchema.parse(await readJson(req));
  const current = await ensureSettings(user.id);

  let aiKeysEnc: string | undefined;
  if (aiKey) {
    const keys = readAiKeys(current);
    if (aiKey.key === null) delete keys[aiKey.provider];
    else keys[aiKey.provider] = aiKey.key;
    aiKeysEnc = encryptJson(keys);
  }
  const updated = await db.userSettings.update({
    where: { userId: user.id },
    data: { ...fields, ...(aiKeysEnc !== undefined ? { aiKeysEnc } : {}) },
  });
  // La risposta dice solo se una chiave c'è: la chiave non torna mai al browser.
  return toSettingsDTO(updated);
});
