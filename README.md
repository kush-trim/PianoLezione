# PianoStudio

Sito per creare i piani lezione (modello "Alcuni aspetti del piano lezione"): editor interattivo, orari delle fasi calcolati dall'orario di insegnamento, cartelle, storico ed export in PDF.

## Avvio

```bash
npm install        # installa le dipendenze e genera il client del database
cp .env.example .env
npm run db:push    # crea il database locale (dev.db), solo la prima volta
npm run dev        # http://localhost:3000
```

Al primo accesso crea un account da "Registrati". Poi:

1. **Orario** – inserisci le lezioni che tieni ogni settimana.
2. **Settimana** – fai clic su una lezione per creare il suo piano: data e orari sono già collegati (le ore consecutive della stessa classe diventano una lezione doppia).
3. Nell'editor aggiungi le fasi: gli orari si ricalcolano a ogni modifica.
4. **Esporta PDF** produce il documento nel formato del modello.

## Comandi

| Comando | Cosa fa |
| --- | --- |
| `npm run dev` | server di sviluppo |
| `npm run build` / `npm start` | build e server di produzione |
| `npm test` | test del motore orari |
| `npm run lint` | controllo del codice |
| `npm run db:push` | applica `prisma/schema.prisma` al database |

## Struttura

- `prisma/schema.prisma` – modello dati (utenti, sessioni, cartelle, orario, piani, fasi, versioni)
- `src/lib/schedule.ts` – motore orari: funzioni pure, con test in `schedule.test.ts`
- `src/lib/plans.ts`, `auth.ts`, `http.ts`, `validation.ts` – logica lato server
- `src/lib/pdf/PianoLezionePdf.tsx` – layout del PDF
- `src/app/api/` – API REST
- `src/app/(app)/` – pagine: `settimana`, `cartelle`, `orario`, `modelli`, `storico`, `piani/[id]`
- `src/components/` – editor (tabella delle fasi, barra dei tempi), griglia settimanale, componenti di base

## API

Tutte le rotte, tranne registrazione e login, richiedono la sessione (cookie `ps_session`) e vedono solo i dati dell'utente.

| Rotta | Metodi |
| --- | --- |
| `/api/auth/register`, `/login`, `/logout`, `/me` | POST, POST, POST, GET |
| `/api/timetable`, `/api/timetable/:id` | GET, POST · PUT, DELETE |
| `/api/folders`, `/api/folders/:id` | GET, POST · PATCH, DELETE |
| `/api/plans` (`?folderId=`, `?q=`, `?templates=1`, `?limit=`) | GET, POST |
| `/api/plans/:id` | GET, PUT, DELETE |
| `/api/plans/:id/duplicate` (`{ asTemplate }`) | POST |
| `/api/plans/:id/versions`, `/versions/:vid/restore` | GET · POST |
| `/api/plans/:id/pdf` (`?download=1`) | GET |
| `/api/phase-templates`, `/api/phase-templates/:id` | GET, POST · PUT, DELETE |
| `/api/week?date=YYYY-MM-DD` | GET |
| `/api/materials` | GET |

## Pubblicazione online

Il database locale è SQLite (`dev.db`). Per pubblicare il sito serve un database in rete: in `prisma/schema.prisma` si cambia `provider` in `postgresql`, in `src/lib/db.ts` si sostituisce l'adapter con `@prisma/adapter-pg`, e si imposta `DATABASE_URL`. Lo schema non usa tipi specifici di SQLite.
