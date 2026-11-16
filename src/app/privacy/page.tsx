import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Privacy · PianoStudio" };

// Pagina pubblica: Google la richiede per l'accesso con Google.
export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-10 leading-relaxed">
      <p className="font-display text-2xl font-semibold tracking-tight">
        Piano<span className="text-accent">Studio</span>
      </p>
      <h1 className="mt-6 font-display text-3xl font-semibold">Privacy</h1>
      <p className="mt-2 text-muted">Quali dati usa PianoStudio e perché.</p>

      <h2 className="mt-8 text-lg font-semibold">Accesso con Google</h2>
      <p className="mt-1">
        Per accedere usi il tuo account Google. PianoStudio riceve il tuo nome, la tua email e un identificativo dell’account:
        servono solo a riconoscerti e a mostrare il tuo nome ai colleghi con cui condividi una cartella.
      </p>

      <h2 className="mt-6 text-lg font-semibold">Google Drive</h2>
      <p className="mt-1">
        PianoStudio chiede il permesso <em>drive.file</em>: può vedere e modificare solo i file e le cartelle che crea lei
        (la cartella «PianoStudio» sul tuo Drive e il suo contenuto), non il resto del tuo Drive. I file degli esercizi che carichi
        vengono salvati lì. Quando condividi una cartella con un collega, PianoStudio la condivide con il suo account Google su Drive;
        quando lo togli, la condivisione viene tolta.
      </p>
      <p className="mt-2">
        Per poter caricare file anche quando non sei collegato (ad esempio un collega nella tua cartella condivisa), PianoStudio
        conserva un token di accesso a Drive, cifrato. Puoi revocarlo in qualsiasi momento dalle impostazioni del tuo account Google
        (Sicurezza → App di terze parti con accesso all’account).
      </p>

      <h2 className="mt-6 text-lg font-semibold">I tuoi dati nel sito</h2>
      <p className="mt-1">
        Piani lezione, orario, cartelle ed eventi restano sul server di PianoStudio, visibili solo a te. Dei file degli esercizi il sito
        conserva nome, tipo, dimensione e il collegamento a Drive. Nessun dato viene venduto o usato per pubblicità.
        Dalle Impostazioni puoi scaricare una copia di tutti i tuoi dati.
      </p>

      <p className="mt-10 text-[13px] text-muted">
        <Link href="/login" className="text-accent hover:underline">
          Torna all’accesso
        </Link>
      </p>
    </main>
  );
}
