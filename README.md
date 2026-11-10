# PianoStudio

Sito per creare i piani lezione (modello "Alcuni aspetti del piano lezione"): editor interattivo, orari delle fasi calcolati dall'orario di insegnamento, cartelle, esercizi, versioni ed export in PDF.

## Avvio

```bash
npm install        # installa le dipendenze e genera il client del database
cp .env.example .env
npm run db:push    # crea il database locale (dev.db), solo la prima volta
npm run dev        # http://localhost:3000
```

Al primo accesso crea un account da "Registrati". Poi:

1. **Settimana** – tutta in una schermata. Fai clic su un punto della griglia per aggiungere una lezione: si ripete ogni settimana da lì in poi. Un clic su una lezione ne mostra i dettagli, il piano collegato e le modifiche valide per quel solo giorno (spostamento, aula, annullamento). In alto, l'anno scolastico con le settimane numerate. Nei giorni di vacanza le lezioni non compaiono; una gita o giornata speciale può togliere le lezioni di una classe. Il filtro mostra una sola classe, il pulsante ⓘ quante lezioni restano fino alla fine dell'anno. Frecce ←/→ e T per muoversi.
2. **Nuovo piano** – la creazione guidata in cinque passi: lezione, punto di partenza, obiettivi (con i verbi dell'elenco), fasi, verifica.
3. Nell'editor gli orari delle fasi si ricalcolano a ogni modifica. Superare la durata prevista è ammesso: viene solo segnalato. In fondo, **Esercizi** collegati e la nota **Dopo la lezione**, che ricompare in cima al piano della lezione successiva della stessa classe.
4. **Esporta PDF** produce il documento nel formato del modello.
5. **Cartelle** – come nel Finder: clic per selezionare, doppio clic per aprire, ⌘/Ctrl + C, X, V, D, Z, A, Canc. Copiando una cartella si copia tutto il contenuto. Ogni anno scolastico nuovo ha la sua cartella ("Anno 2027/2028"): i piani copiati lì (anche in una sottocartella con il nome della classe) vengono riportati in quell'anno, con la settimana proposta in base all'anno precedente.
6. **Esercizi** – file (PDF, Word, Excel, PowerPoint, immagini…) da collegare a nessuno, uno o più piani.
7. **Impostazioni** – durata dell'ora di lezione, anno scolastico e vacanze (a mano o importate dal PDF del calendario scolastico del Cantone Ticino), verbi per gli obiettivi, assistente AI (Claude, Gemini o OpenAI con la propria chiave), calendari iCal in sola lettura, link per abbonarsi all'orario da un altro calendario, token per le API, copia di sicurezza dei dati.
8. **⌘K / Ctrl+K** da qualsiasi pagina: ricerca rapida di piani, cartelle, esercizi e pagine.

Il file `.env` contiene anche `APP_SECRET`: serve a cifrare nel database le chiavi AI e i link dei calendari. In sviluppo può restare vuota; in produzione è obbligatoria (lo script di deploy la genera sul server).

## Comandi

| Comando | Cosa fa |
| --- | --- |
| `npm run dev` | server di sviluppo |
| `npm run build` / `npm start` | build e server di produzione |
| `npm test` | test (motore orari, calendario, import del calendario scolastico, proposta delle settimane) |
| `npm run lint` | controllo del codice |
| `npm run db:push` | applica `prisma/schema.prisma` al database |

## Struttura

- `prisma/schema.prisma` – modello dati (utenti, sessioni, token, cartelle, orario, piani, fasi, versioni, esercizi)
- `src/lib/schedule.ts` – motore orari: funzioni pure, con test in `schedule.test.ts`
- `src/lib/calendar.ts` – lezioni ricorrenti, modifiche di un giorno, vacanze ed eventi che tolgono lezioni, lezioni rimaste, settimane dell'anno scolastico (test in `calendar.test.ts`)
- `src/lib/school-calendar.ts` – lettura del calendario scolastico ufficiale (PDF → anno e vacanze); `src/lib/year-proposal.ts` – settimana proposta per i piani copiati nel nuovo anno
- `src/lib/exercises.ts`, `file-types.ts` – esercizi e tipi di file ammessi; `src/lib/ical-export.ts` – il link del calendario da abbonare
- `src/lib/ical.ts` – lettura dei calendari esterni; `src/lib/ai.ts`, `ai-proposal.ts` – assistente; `src/lib/crypto.ts` – cifratura
- `src/lib/plans.ts`, `auth.ts`, `http.ts`, `validation.ts` – logica lato server
- `src/lib/pdf/PianoLezionePdf.tsx` – layout del PDF
- `src/app/api/` – API REST
- `src/app/(app)/` – pagine: `settimana`, `cartelle`, `esercizi`, `modelli`, `impostazioni`, `piani/nuovo`, `piani/[id]`
- `src/components/` – editor (tabella delle fasi, barra dei tempi), griglia settimanale, componenti di base

## API

La descrizione completa (richieste e risposte) è su `GET /api`. Tutte le rotte, tranne registrazione, login e il link del calendario, richiedono la sessione (cookie `ps_session`) oppure un token (`Authorization: Bearer ps_…`, da Impostazioni → Accesso API: sola lettura o lettura e scrittura) e vedono solo i dati dell'utente.

| Rotta | Metodi |
| --- | --- |
| `/api/auth/register`, `/login`, `/logout`, `/me` | POST, POST, POST, GET |
| `/api/timetable` (`?date=` → lezioni di quel giorno), `/api/timetable/:id` | GET, POST · PUT, DELETE |
| `/api/timetable/:id/exceptions/:data` (modifica di un solo giorno) | PUT, DELETE |
| `/api/timetable/:id/split`, `/end` (da una data in poi) | POST |
| `/api/events`, `/api/events/:id` | POST · PUT, DELETE |
| `/api/settings`, `/api/settings/calendars`, `/api/settings/calendars/:id` | GET, PUT · POST · DELETE |
| `/api/verbs`, `/api/school-years`, `/api/holidays` (e `/:id`) | GET, POST · DELETE (anni: anche PUT) |
| `/api/year?date=` (settimane numerate dell'anno scolastico) | GET |
| `/api/ai/chat` (risposta in streaming), `/api/ai/models?provider=` | POST · GET |
| `/api/folders`, `/api/folders/:id` | GET, POST · PATCH, DELETE |
| `/api/plans` (`?folderId=`, `?q=`, `?templates=1`, `?limit=`) | GET, POST |
| `/api/plans/:id` | GET, PUT, DELETE |
| `/api/plans/:id/duplicate` (`{ asTemplate }`) | POST |
| `/api/plans/:id/versions`, `/versions/:vid/restore` | GET · POST |
| `/api/plans/:id/pdf` (`?download=1`) | GET |
| `/api/phase-templates`, `/api/phase-templates/:id` | GET, POST · PUT, DELETE |
| `/api/week?date=YYYY-MM-DD` | GET |
| `/api/materials` | GET |
| `/api/folders/paste` (copia o sposta cartelle e piani) | POST |
| `/api/plans/bulk-delete`, `/api/plans/restore`, `/api/plans/:id/previous` | POST · POST · GET |
| `/api/exercises` (`?q=`; caricamento multipart), `/api/exercises/:id` | GET, POST · GET, PATCH, DELETE |
| `/api/exercises/:id/file`, `/api/exercises/:id/plans/:planId` | GET · POST, DELETE |
| `/api/school-years/import`, `/import/apply` | POST · POST |
| `/api/classes/remaining`, `/api/year/propose` | GET · POST |
| `/api/settings/tokens`, `/api/settings/tokens/:id` | GET, POST · DELETE |
| `/api/feed/:token` (iCal), `/api/export` (JSON) | GET · GET |

## Pubblicazione online

Il database locale è SQLite (`dev.db`). Per pubblicare il sito serve un database in rete: in `prisma/schema.prisma` si cambia `provider` in `postgresql`, in `src/lib/db.ts` si sostituisce l'adapter con `@prisma/adapter-pg`, e si imposta `DATABASE_URL`. Lo schema non usa tipi specifici di SQLite.

## Deploy sul server

```powershell
powershell -File strumenti\deploy.ps1
```

Impacchetta l'ultimo commit, fa la build sul PC, la copia sul server, installa le dipendenze se sono cambiate, aggiorna il database e riavvia il processo pm2. Il database (`data/`) e il file `.env` del server non vengono toccati. L'indirizzo del server va scritto in `strumenti/server-remoto.txt`, che non è in git.
