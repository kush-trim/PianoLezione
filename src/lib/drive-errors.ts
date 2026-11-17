// Traduce le risposte di errore di Google Drive in errori dell'app.
// Mai 502 o 504: Cloudflare sostituisce quelle risposte con una sua pagina HTML
// e il messaggio non arriverebbe a chi usa il sito.

import { ApiError } from "./http";

/** Il "reason" del primo errore nella risposta JSON di Google, se c'è. */
function reasonOf(body: string): string {
  try {
    const data = JSON.parse(body) as { error?: { errors?: { reason?: string }[] } };
    return data.error?.errors?.[0]?.reason ?? "";
  } catch {
    return "";
  }
}

export function driveError(status: number, body: string): ApiError {
  const reason = reasonOf(body);
  if (status === 404) return new ApiError(404, "Il file o la cartella non esiste più su Google Drive");
  if (status === 403 && (/storageQuota/i.test(reason) || /storageQuota/i.test(body))) {
    return new ApiError(507, "Lo spazio su Google Drive è esaurito");
  }
  if (status === 403 && reason === "appNotAuthorizedToChild") {
    // Google rifiuta di condividere la cartella perché dice che il sito non ha accesso a
    // tutto il suo contenuto. Succede con cartelle non vuote anche se il contenuto l'ha
    // creato il sito: la causa è ancora da capire, intanto un messaggio chiaro.
    return new ApiError(
      409,
      "Google Drive non ha permesso di condividere questa cartella. Riprova più tardi o avvisa chi ti ha invitato.",
    );
  }
  return new ApiError(424, "Google Drive ha rifiutato l'operazione");
}
