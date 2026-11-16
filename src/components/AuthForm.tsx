"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ErrorNote } from "./ui";

const ERRORS: Record<string, string> = {
  annullato: "Accesso annullato su Google.",
  sessione: "L'accesso è scaduto o è stato aperto in un'altra finestra. Riprova.",
  email: "L'email del tuo account Google non è verificata.",
  google: "Google non ha completato l'accesso. Riprova tra poco.",
  configurazione: "L'accesso con Google non è ancora configurato sul server.",
};

/** Logo "G" di Google, nei suoi colori (come richiesto dalle linee guida del pulsante). */
function GoogleMark() {
  return (
    <svg viewBox="0 0 48 48" className="size-5" aria-hidden>
      <path fill="#FFC107" d="M43.6 20.1H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.6-.4-3.9z" />
      <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.1H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.6-.4-3.9z" />
    </svg>
  );
}

/** Accesso: solo con Google. Chi entra con Google ha già il suo Drive collegato per gli esercizi. */
export function AuthForm() {
  const params = useSearchParams();
  const error = ERRORS[params.get("errore") ?? ""] ?? (params.get("errore") ? ERRORS.google : "");
  const next = params.get("next");
  const href = `/api/auth/google${next ? `?next=${encodeURIComponent(next)}` : ""}`;

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <p className="font-display text-3xl font-semibold tracking-tight">
          Piano<span className="text-accent">Studio</span>
        </p>
        <p className="mt-1 mb-6 text-muted">Piani lezione, orario e materiali, in un posto solo.</p>

        <div className="space-y-4 rounded-xl border border-line bg-surface p-5">
          {/* Link normale, non fetch: l'accesso è un giro di reindirizzamenti verso Google e ritorno. */}
          <a
            href={href}
            className="flex h-11 w-full items-center justify-center gap-3 rounded-md border border-line-strong bg-white font-medium text-[#1f1f1f] transition-colors hover:bg-[#f7f8f8]"
          >
            <GoogleMark />
            Accedi con Google
          </a>
          <ErrorNote>{error}</ErrorNote>
          <p className="text-[13px] leading-relaxed text-muted">
            Google chiede anche il permesso per Google Drive: i file degli esercizi che carichi finiscono in una cartella
            «PianoStudio» sul tuo Drive. L’app vede solo i file e le cartelle che crea lei.
          </p>
        </div>

        <p className="mt-4 text-center text-[13px] text-muted">
          <Link href="/privacy" className="hover:underline">
            Privacy: quali dati usa PianoStudio
          </Link>
        </p>
      </div>
    </main>
  );
}
