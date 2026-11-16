// Ultimo passo dell'accesso (con Google o, nelle prove, con dev-login): sessione e lavori del primo accesso.

import { createSession } from "./auth";
import { migrateLegacyExercises } from "./exercises";

export async function finishLogin(userId: string) {
  await createSession(userId);
  // I file caricati sul sito prima di Drive passano su Drive. Se Drive non risponde
  // l'accesso va avanti comunque: si riprova al prossimo accesso.
  try {
    const moved = await migrateLegacyExercises(userId);
    if (moved) console.log(`accesso: ${moved} file spostati su Google Drive per ${userId}`);
  } catch (e) {
    console.error("accesso: spostamento dei file su Drive non riuscito", e instanceof Error ? e.message : e);
  }
}
