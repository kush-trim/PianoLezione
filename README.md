# PianoStudio

Sito per creare i piani lezione (modello "Alcuni aspetti del piano lezione"): editor interattivo, orari delle fasi calcolati dall'orario di insegnamento, cartelle, file su Google Drive con cartelle condivise tra docenti, versioni ed export in PDF.

## Avvio

```bash
npm install        # installa le dipendenze e genera il client del database
cp .env.example .env
npm run db:push    # crea il database locale (dev.db), solo la prima volta
npm run dev        # http://localhost:3000
```

Si entra solo con **Accedi con Google** (per la configurazione vedi [Accesso con Google](#accesso-con-google)). Poi:

1. **Settimana** – tutta in una schermata. Fai clic su un punto della griglia per aggiungere una lezione: si ripete ogni settimana da lì in poi. Un clic su una lezione ne mostra i dettagli, il piano collegato e le modifiche valide per quel solo giorno (spostamento, aula, annullamento). In alto, l'anno scolastico con le settimane numerate. Nei giorni di vacanza le lezioni non compaiono; un evento (una gita, la settimana bianca) può durare uno o più giorni e togliere le lezioni di una classe o di tutte. Il filtro mostra una sola classe, il pulsante ⓘ quante lezioni restano fino alla fine dell'anno. Frecce ←/→ e T per muoversi.
2. **Nuovo piano** – la creazione guidata in cinque passi: lezione, punto di partenza, obiettivi (con i verbi dell'elenco), fasi, verifica.
3. Nell'editor gli orari delle fasi si ricalcolano a ogni modifica. Superare la durata prevista è ammesso: viene solo segnalato. In fondo, i **File** collegati e la nota **Dopo la lezione**, che ricompare in cima al piano della lezione successiva della stessa classe.
4. **Esporta PDF** produce il documento nel formato del modello.
5. **Piano Lezione** (`/piani`) – i piani in cartelle, come nel Finder (con il percorso in alto, ⓘ per le informazioni della cartella e la ricerca in tutti i piani: titolo, obiettivi, fasi, classe): clic per selezionare, doppio clic per aprire, ⌘/Ctrl + C, X, V, D, Z, A, Canc. Copiando una cartella si copia tutto il contenuto. Ogni anno scolastico nuovo ha la sua cartella ("Anno 2027/2028"): i piani copiati lì (anche in una sottocartella con il nome della classe) vengono riportati in quell'anno, con la settimana proposta in base all'anno precedente.
6. **File** (`/file`) – file (PDF, Word, Excel, PowerPoint, immagini…) da collegare a nessuno, uno o più piani. Il sito fa da ponte: i file finiscono sul Google Drive di chi possiede la cartella, nella cartella `PianoStudio`. Ognuno ha "I miei file" e può creare altre cartelle, con **sottocartelle** a più livelli, e **condividerle**: inviti un collega con la sua email Google, lui accetta da **Notifiche** (la campanella) e la cartella è condivisa tra voi, anche su Drive. Chi è nella cartella vede i file, ne carica altri e li collega ai propri piani; rinominare, condividere ed eliminare la cartella spetta al proprietario. Si condivide la cartella principale: le sottocartelle seguono. Si selezionano più file con le caselle (Maiusc, ⌘A) per spostarli, etichettarli o eliminarli insieme; file e cartelle si spostano anche trascinandoli su una cartella, e una cartella si può mettere dentro un'altra dello stesso Drive. I file si spostano tra le cartelle dello stesso Drive e hanno **etichette** (Teoria, Esercizi, Soluzioni, Extra per gli allievi più veloci, o libere) per filtrarli; ⓘ su un file dice chi l'ha caricato, quando, dove sta e in quali piani è usato. Una cartella condivisa da un collega si può **copiare sul proprio Drive** con sottocartelle e file; ⓘ mostra le informazioni di una cartella (percorso, proprietario, chi la vede, contenuto, spazio) e in fondo all'elenco c'è lo spazio occupato su Drive. Eliminare manda nel cestino di Drive.
7. **Impostazioni** – account Google e permesso per Drive, durata dell'ora di lezione, anno scolastico e vacanze (a mano o importate dal PDF del calendario scolastico del Cantone Ticino), verbi per gli obiettivi, assistente AI (Claude, Gemini o OpenAI con la propria chiave), calendari iCal in sola lettura, link per abbonarsi all'orario da un altro calendario, token per le API, copia di sicurezza dei dati.
8. **⌘K / Ctrl+K** da qualsiasi pagina: ricerca rapida di piani, cartelle, file e pagine.

Il file `.env` contiene anche `APP_SECRET`: serve a cifrare nel database i token di Google, le chiavi AI e i link dei calendari. In sviluppo può restare vuota; in produzione è obbligatoria (lo script di deploy la genera sul server).

### Accesso con Google

Servono `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` e `APP_URL` nel `.env` (il secret mai nel repository). Su [Google Cloud Console](https://console.cloud.google.com/), una volta sola:

1. Crea un progetto e abilita la **Google Drive API**.
2. **Schermata di consenso OAuth**: tipo Esterno; home page e pagina `/privacy` del sito; permessi `openid`, `email`, `profile` e `.../auth/drive.file` (il sito vede solo i file e le cartelle che crea lui). Pubblica l'app ("In produzione"): in "Test" l'accesso a Drive scade ogni 7 giorni.
3. **Credenziali → ID client OAuth → Applicazione web**, con URI di reindirizzamento `<APP_URL>/api/auth/google/callback` (per lo sviluppo: `http://localhost:3000/api/auth/google/callback`).

Il token di Google resta sul server, cifrato. Nelle cartelle condivise il sito lavora con l'account del proprietario: i file caricati dai colleghi occupano il suo spazio Drive (nel sito resta scritto chi li ha caricati).

**Prove senza Google** (mai in produzione): `DEV_LOGIN=1` abilita `POST /api/auth/dev-login` (`{ "email": "...", "drive": true }`), `DRIVE_FAKE=1` usa un Drive finto in memoria.

## Comandi

| Comando | Cosa fa |
| --- | --- |
| `npm run dev` | server di sviluppo |
| `npm run build` / `npm start` | build e server di produzione |
| `npm test` | test (motore orari, calendario ed eventi su più giorni, import del calendario scolastico, proposta delle settimane, accesso con Google) |
| `npm run lint` | controllo del codice |
| `npm run db:push` | applica `prisma/schema.prisma` al database |

## Struttura

- `prisma/schema.prisma` – modello dati (utenti, account Google, sessioni, token, cartelle, orario, eventi, piani, fasi, versioni, file (`Exercise`), cartelle di file con membri e inviti, notifiche)
- `src/lib/schedule.ts` – motore orari: funzioni pure, con test in `schedule.test.ts`
- `src/lib/calendar.ts` – lezioni ricorrenti, modifiche di un giorno, vacanze ed eventi che tolgono lezioni, lezioni rimaste, settimane dell'anno scolastico (test in `calendar.test.ts`)
- `src/lib/school-calendar.ts` – lettura del calendario scolastico ufficiale (PDF → anno e vacanze); `src/lib/year-proposal.ts` – settimana proposta per i piani copiati nel nuovo anno
- `src/lib/google-oauth.ts` – accesso con Google (OAuth con PKCE); `google-account.ts` – utente collegato all'account Google; `google-drive.ts` – Google Drive (e il Drive finto per le prove)
- `src/lib/materials.ts` – cartelle di file, inviti, membri, notifiche; `src/lib/exercises.ts`, `file-types.ts` – i file (nel codice e nelle API si chiamano ancora "exercises") e i tipi ammessi; `tags.ts` – etichette; `folder-copy.ts` – copia di una cartella sul proprio Drive; `src/lib/ical-export.ts` – il link del calendario da abbonare
- `src/lib/ical.ts` – lettura dei calendari esterni; `src/lib/ai.ts`, `ai-proposal.ts` – assistente; `src/lib/crypto.ts` – cifratura
- `src/lib/plans.ts`, `auth.ts`, `http.ts`, `validation.ts` – logica lato server
- `src/lib/pdf/PianoLezionePdf.tsx` – layout del PDF
- `src/app/api/` – API REST
- `src/app/(app)/` – pagine: `settimana`, `piani` (Piano Lezione), `file`, `modelli`, `notifiche`, `impostazioni`, `piani/nuovo`, `piani/[id]`; fuori dall'app `login` e `privacy`
- `src/components/` – editor (tabella delle fasi, barra dei tempi), griglia settimanale, componenti di base

## API

La descrizione completa (richieste e risposte) è su `GET /api`. Tutte le rotte, tranne l'accesso con Google e il link del calendario, richiedono la sessione (cookie `ps_session`) oppure un token (`Authorization: Bearer ps_…`, da Impostazioni → Accesso API: sola lettura o lettura e scrittura) e vedono solo i dati dell'utente.

| Rotta | Metodi |
| --- | --- |
| `/api/auth/google` (`?next=`, `?drive=1`), `/google/callback` | GET · GET |
| `/api/auth/logout`, `/api/auth/me` | POST · GET |
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
| `/api/exercises` (`?q=`, `?folderId=`, `?tag=`; caricamento multipart su Drive), `/api/exercises/:id` | GET, POST · GET, PATCH, DELETE |
| `/api/exercises/:id/file` (apre il file su Drive), `/api/exercises/:id/plans/:planId` | GET · POST, DELETE |
| `/api/material-folders` (anche sottocartelle: `parentId`), `/api/material-folders/:id` | GET, POST · PATCH, DELETE |
| `/api/material-folders/storage` (spazio occupato), `/api/material-folders/:id/copy` (copia sul mio Drive) | GET · POST |
| `/api/exercises/tags` (etichette usate) | GET |
| `/api/material-folders/:id/invites`, `/invites/:inviteId`, `/members/:userId` | POST · DELETE · DELETE |
| `/api/invites/:id/accept`, `/decline` | POST · POST |
| `/api/notifications`, `/api/notifications/read` | GET · POST |
| `/api/school-years/import`, `/import/apply` | POST · POST |
| `/api/classes/remaining`, `/api/year/propose` | GET · POST |
| `/api/settings/tokens`, `/api/settings/tokens/:id` | GET, POST · DELETE |
| `/api/feed/:token` (iCal), `/api/export` (JSON) | GET · GET |

## Pubblicazione online

Il database locale è SQLite (`dev.db`). Per pubblicare il sito serve un database in rete: in `prisma/schema.prisma` si cambia `provider` in `postgresql`, in `src/lib/db.ts` si sostituisce l'adapter con `@prisma/adapter-pg`, e si imposta `DATABASE_URL`. Lo schema non usa tipi specifici di SQLite.

## Deploy sul server

**Automatico, a ogni push su `main`.** Non serve fare altro che il push.

1. GitHub (`.github/workflows/deploy.yml`) esegue lint e test, fa la build e pubblica il pacchetto pronto nella release `deploy` del repository. Se lint, test o build falliscono, non viene pubblicato niente.
2. Sul server un processo pm2 (`pianolezione-deploy`, lo script è `strumenti/server/auto-deploy.sh`) controlla ogni minuto se c'è un pacchetto nuovo. Lo scarica, ne verifica l'impronta, installa le dipendenze se sono cambiate, aggiorna il database e riavvia il sito. Se dopo il riavvio il sito non risponde, rimette il codice di prima.
3. L'ultimo passo del workflow aspetta che `/api/health` dichiari il commit nuovo: la spunta verde su GitHub significa che il sito è davvero aggiornato.

Il server non è raggiungibile da GitHub (rete privata), per questo è il server a prendersi il pacchetto e non GitHub a spingerlo. La build si fa su GitHub perché sul server non è possibile.

Da sapere:

- Chiunque possa fare push su `main` pubblica sul sito ed esegue codice sul server: vale anche per i collaboratori del repository.
- Il database (`data/`) e il file `.env` del server (con `APP_SECRET` e le credenziali di Google) non vengono mai toccati; prima di ogni aggiornamento dello schema viene fatta una copia del database. Le modifiche allo schema che cancellerebbero dati vengono rifiutate e il deploy si ferma.
- Il ripristino automatico riguarda il codice, non lo schema del database.
- Registro sul server: `~/pianolezione-deploy/deploy.log`. Stato: `pm2 list`.

Deploy manuale, di riserva (dal PC, con accesso SSH al server):

```powershell
powershell -File strumenti\deploy.ps1
```

Fa la build sul PC e la copia sul server. L'indirizzo del server va scritto in `strumenti/server-remoto.txt`, che non è in git. Il prossimo push su `main` sostituisce comunque ciò che è stato pubblicato a mano.
