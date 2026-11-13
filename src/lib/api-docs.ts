// Descrizione delle API, servita da GET /api.
// Va aggiornata insieme alle rotte in src/app/api e agli schemi in src/lib/validation.ts.

type Fields = Record<string, string>;

type Endpoint = {
  metodo: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  percorso: string;
  descrizione: string;
  /** false = non serve la sessione. */
  autenticazione?: boolean;
  parametri?: Fields; // nel percorso o nella query string
  corpo?: Fields; // JSON della richiesta; "?" dopo il nome = facoltativo
  risposta: string | Fields;
  errori?: Fields;
};

// --- Forme dei dati ricorrenti ---

const tipi: Record<string, Fields | string> = {
  data: 'stringa "YYYY-MM-DD"',
  ora: 'stringa "HH:MM" (24 ore)',
  colore: '"slate" | "blue" | "teal" | "green" | "amber" | "orange" | "rose" | "violet"',
  Utente: { id: "string", name: "string", email: "string" },
  Lezione: {
    id: "string",
    weekday: "numero 1–7 (1 = lunedì)",
    startTime: "ora",
    endTime: "ora",
    subject: "string",
    className: "string",
    room: "string",
    color: "colore",
    validFrom: "data | null — primo giorno di validità (null = da sempre)",
    validTo: "data | null — ultimo giorno di validità (null = senza fine)",
  },
  LezioneDelGiorno: {
    slot: "Lezione",
    date: "data",
    startTime: "ora effettiva di quel giorno",
    endTime: "ora effettiva di quel giorno",
    room: "string",
    cancelled: "boolean — annullata solo quel giorno",
    modified: "boolean — spostata o in altra aula solo quel giorno",
    note: "string",
  },
  Eccezione: {
    id: "string",
    slotId: "string",
    date: "data",
    kind: '"annullata" | "modificata"',
    startTime: "ora | null",
    endTime: "ora | null",
    room: "string | null",
    note: "string",
  },
  Evento: {
    id: "string",
    title: "string",
    date: "data",
    startTime: "ora | null (null = tutto il giorno)",
    endTime: "ora | null",
    kind: '"gita" | "altro"',
    color: "colore",
    note: "string",
    className: 'string — classe coinvolta, "" = tutte',
    cancelsLessons: "boolean — le lezioni della classe quel giorno (o in quegli orari) non si tengono",
  },
  Obiettivo: { id: "string", verbo: "string — uno dei verbi dell'elenco", testo: "string" },
  Fase: {
    id: "string (generato dal client, es. UUID)",
    name: "string",
    modality: "string",
    durationMin: "numero intero 0–600",
    obiettiviSpecifici: "string",
    descrizione: "string",
    prodottoAtteso: "string",
    materiale: "string",
  },
  Piano: {
    id: "string",
    folderId: "string | null",
    title: "string",
    date: "data | null",
    manualStart: "ora | null — ora di inizio, se il piano non è collegato a una lezione",
    manualDuration: "numero | null — durata prevista in minuti, se non è collegato a una lezione",
    prerequisiti: "string",
    obiettivoInsegnamento: "string — testo generato dagli obiettivi strutturati, se presenti",
    traguardo: "string",
    obiettivoApprendimento: "string — come sopra",
    obiettiviInsegnamento: "Obiettivo[]",
    obiettiviApprendimento: "Obiettivo[]",
    verifica: "string",
    allegati: "string",
    allegatiAuto: "boolean — true: gli allegati si ricavano dai materiali delle fasi",
    sezioniExtra: "{ id, titolo, testo }[]",
    notaPost: "string — dopo la lezione: cosa riprendere (non va nel PDF)",
    exercises: "{ id, title, fileName, size }[] — esercizi collegati",
    isTemplate: "boolean",
    slotIds: "string[] — lezioni dell'orario collegate",
    slots: "Lezione[] — con gli orari effettivi del giorno del piano",
    phases: "Fase[] in ordine",
    createdAt: "data e ora ISO",
    updatedAt: "data e ora ISO",
  },
  PianoInElenco: {
    id: "string",
    folderId: "string | null",
    title: "string",
    date: "data | null",
    isTemplate: "boolean",
    slotIds: "string[]",
    phaseCount: "numero",
    totalMin: "numero — somma delle durate delle fasi",
    updatedAt: "data e ora ISO",
  },
  Cartella: {
    id: "string",
    parentId: "string | null",
    name: "string",
    color: "colore",
    order: "numero",
    planCount: "numero di piani contenuti",
    schoolYearId: "string | null — cartella di un anno scolastico (\"Anno 2027/2028\")",
  },
  Esercizio: {
    id: "string",
    title: "string",
    fileName: "string",
    size: "numero di byte",
    note: "string",
    createdAt: "data e ora ISO",
    plans: "{ id, title, date }[] — piani collegati (anche nessuno)",
  },
  Token: {
    id: "string",
    name: "string",
    prefix: "string — i primi caratteri, per riconoscerlo",
    scope: '"read" | "write" | "feed"',
    lastUsedAt: "data e ora ISO | null",
    expiresAt: "data e ora ISO | null",
    createdAt: "data e ora ISO",
  },
  Versione: { id: "string", createdAt: "data e ora ISO", title: "string", phaseCount: "numero", totalMin: "numero" },
  FasePredefinita: { id: "string", name: "string", modality: "string", durationMin: "numero" },
  Verbo: { id: "string", kind: '"insegnamento" | "apprendimento"', text: "string" },
  Periodo: { id: "string", name: "string", startDate: "data", endDate: "data (inclusa)" },
  Impostazioni: {
    lessonMinutes: "numero — durata di un'ora di lezione",
    defaultHours: "numero — ore proposte per una nuova lezione o un nuovo piano",
    aiProvider: '"anthropic" | "google" | "openai" | ""',
    aiModel: "string",
    aiKeys: "{ anthropic: boolean, google: boolean, openai: boolean } — dice solo se una chiave è salvata",
    calendars: "{ id, name, host, asHolidays }[] — il link completo non viene mai restituito",
  },
  Proposta: {
    sintesi: "string",
    "titolo?": "string",
    "prerequisiti?": "string",
    "traguardo?": "string",
    "verifica?": "string",
    "obiettiviInsegnamento?": "{ verbo, testo }[] — verbo vuoto se non era nell'elenco",
    "obiettiviApprendimento?": "{ verbo, testo }[]",
    "fasi?": "{ nome, modalita, durataMin, obiettiviSpecifici, descrizione, prodottoAtteso, materiale }[]",
  },
};

const lezioneCorpo: Fields = {
  weekday: "numero 1–7",
  startTime: "ora",
  endTime: "ora, dopo startTime",
  subject: "string, obbligatoria",
  "className?": "string",
  "room?": "string",
  "color?": "colore (predefinito blue)",
  "validFrom?": "data | null",
  "validTo?": "data | null",
};

const eventoCorpo: Fields = {
  title: "string",
  date: "data",
  "startTime?": "ora | null",
  "endTime?": "ora | null, dopo startTime",
  "kind?": '"gita" | "altro" (predefinito altro)',
  "color?": "colore (predefinito amber)",
  "note?": "string",
  "className?": 'string ("" = tutte le classi)',
  "cancelsLessons?": "boolean (predefinito false)",
};

const periodoCorpo: Fields = { name: "string", startDate: "data", endDate: "data, uguale o successiva a startDate" };

const ok = "{ ok: true }";

const gruppi: Record<string, Endpoint[]> = {
  Autenticazione: [
    {
      metodo: "POST",
      percorso: "/api/auth/register",
      descrizione: "Crea un account e apre la sessione. Crea anche fasi predefinite, verbi e anno scolastico iniziali.",
      autenticazione: false,
      corpo: { name: "string", email: "string", password: "string, almeno 8 caratteri" },
      risposta: "Utente (e il cookie di sessione)",
      errori: { 400: "dati non validi", 409: "email già registrata" },
    },
    {
      metodo: "POST",
      percorso: "/api/auth/login",
      descrizione: "Apre la sessione.",
      autenticazione: false,
      corpo: { email: "string", password: "string" },
      risposta: "Utente (e il cookie di sessione)",
      errori: { 401: "email o password non corretti" },
    },
    { metodo: "POST", percorso: "/api/auth/logout", descrizione: "Chiude la sessione.", autenticazione: false, risposta: ok },
    { metodo: "GET", percorso: "/api/auth/me", descrizione: "L'utente della sessione.", risposta: "Utente" },
  ],

  "Settimana e anno scolastico": [
    {
      metodo: "GET",
      percorso: "/api/week",
      descrizione: "Tutto ciò che serve per mostrare una settimana.",
      parametri: { "date?": "data — un giorno qualsiasi della settimana (predefinito: oggi)" },
      risposta: {
        monday: "data",
        days: "data[7], da lunedì a domenica",
        slots: "Lezione[] valide almeno un giorno della settimana",
        exceptions: "Eccezione[] della settimana",
        events: "Evento[] della settimana",
        external: "{ title, date, startTime, endTime, calendar }[] — eventi dei calendari iCal",
        holidays: "{ date, name }[] — giorni di vacanza (a mano + calendari)",
        plans: "PianoInElenco[] con data nella settimana",
        year: "Periodo | null — anno scolastico della settimana",
        weekNumber: "numero | null — null se la settimana è tutta di vacanza o fuori dall'anno",
        settings: "{ lessonMinutes, defaultHours }",
        calendarErrors: "string[] — calendari che non è stato possibile leggere",
      },
    },
    {
      metodo: "GET",
      percorso: "/api/year",
      descrizione: "Le settimane numerate dell'anno scolastico che contiene la data.",
      parametri: { "date?": "data (predefinito: oggi)" },
      risposta: {
        year: "Periodo | null",
        years: "Periodo[] — tutti gli anni scolastici",
        weeks: "{ monday: data, number: numero | null, holiday: string | null, plans: numero }[]",
      },
    },
    {
      metodo: "GET",
      percorso: "/api/classes/remaining",
      descrizione:
        "Per ogni classe e materia, le lezioni che restano fino alla fine dell'anno scolastico (senza vacanze, lezioni annullate ed eventi che le tolgono).",
      parametri: { "date?": "data da cui contare (predefinito: oggi)" },
      risposta: {
        year: "Periodo | null",
        from: "data",
        schoolDaysLeft: "numero — giorni feriali di scuola rimasti",
        weeksLeft: "numero — settimane di scuola rimaste",
        classes: "{ className, subject, color, remaining, remainingMin, planned, done, daysLeft, nextDate }[]",
      },
    },
    {
      metodo: "POST",
      percorso: "/api/year/propose",
      descrizione:
        "Per i piani arrivati in una cartella di un anno scolastico (o in una sua sottocartella): la settimana e la lezione proposte in quell'anno, cioè la stessa settimana e la stessa posizione dell'anno di provenienza. Non salva nulla.",
      corpo: {
        targetFolderId: "string",
        plans: "{ planId: string, sourceId?: string — il piano da cui è stato copiato }[]",
      },
      risposta:
        "null se la cartella non è di un anno o i piani sono già in quell'anno; altrimenti { year: Periodo, weeks: { monday, number, lessons: { date, slotIds, startTime, endTime, subject, className, taken }[] }[], plans: { planId, title, sourceDate, sourceWeek, monday, date, slotIds }[] }",
    },
    {
      metodo: "GET",
      percorso: "/api/feed/:token",
      descrizione:
        "L'orario in formato iCal (da 3 mesi fa a un anno da oggi): lezioni con il titolo del piano, eventi e vacanze. Il token, di ambito \"feed\", sostituisce l'accesso.",
      autenticazione: false,
      risposta: "text/calendar",
      errori: { 404: "token inesistente, revocato o di un altro ambito" },
    },
  ],

  "Orario (lezioni ricorrenti)": [
    {
      metodo: "GET",
      percorso: "/api/timetable",
      descrizione: "Senza parametri: tutte le lezioni ricorrenti. Con date: le lezioni di quel giorno, con le modifiche di quel giorno applicate.",
      parametri: { "date?": "data" },
      risposta: "Lezione[] — oppure LezioneDelGiorno[] se c'è date",
    },
    { metodo: "POST", percorso: "/api/timetable", descrizione: "Aggiunge una lezione ricorrente.", corpo: lezioneCorpo, risposta: "Lezione" },
    {
      metodo: "PUT",
      percorso: "/api/timetable/:id",
      descrizione: "Modifica la lezione ricorrente per tutte le settimane, anche passate.",
      corpo: lezioneCorpo,
      risposta: ok,
    },
    {
      metodo: "DELETE",
      percorso: "/api/timetable/:id",
      descrizione: "Elimina la lezione ricorrente del tutto. I piani collegati restano, senza lezione.",
      risposta: ok,
    },
    {
      metodo: "POST",
      percorso: "/api/timetable/:id/split",
      descrizione: "Modifica la lezione da una data in poi: la lezione attuale finisce il giorno prima e ne nasce una nuova. I piani successivi seguono la nuova.",
      corpo: { from: "data", slot: "come il corpo di POST /api/timetable" },
      risposta: "Lezione — quella nuova",
    },
    {
      metodo: "POST",
      percorso: "/api/timetable/:id/end",
      descrizione: "Toglie la lezione dall'orario da una data in poi; il passato resta.",
      corpo: { from: "data" },
      risposta: ok,
    },
    {
      metodo: "PUT",
      percorso: "/api/timetable/:id/exceptions/:data",
      descrizione: "Modifica valida per un solo giorno: spostata, in un'altra aula o annullata.",
      corpo: {
        kind: '"annullata" | "modificata"',
        "startTime?": "ora | null (solo con modificata)",
        "endTime?": "ora | null",
        "room?": "string | null",
        "note?": "string",
      },
      risposta: "Eccezione",
      errori: { 400: "in quel giorno la lezione non c'è" },
    },
    { metodo: "DELETE", percorso: "/api/timetable/:id/exceptions/:data", descrizione: "Ripristina la lezione normale per quel giorno.", risposta: ok },
  ],

  Eventi: [
    { metodo: "POST", percorso: "/api/events", descrizione: "Aggiunge un evento di un giorno (gita, altro).", corpo: eventoCorpo, risposta: "Evento" },
    { metodo: "PUT", percorso: "/api/events/:id", descrizione: "Modifica un evento.", corpo: eventoCorpo, risposta: ok },
    { metodo: "DELETE", percorso: "/api/events/:id", descrizione: "Elimina un evento.", risposta: ok },
  ],

  "Piani lezione": [
    {
      metodo: "GET",
      percorso: "/api/plans",
      descrizione: "Elenco dei piani, dal più recente.",
      parametri: {
        "folderId?": 'id di una cartella, oppure "none" per i piani senza cartella',
        "q?": "testo cercato nel titolo",
        "templates?": '"1" per avere i modelli invece dei piani',
        "limit?": "numero massimo di risultati",
      },
      risposta: "PianoInElenco[]",
    },
    {
      metodo: "POST",
      percorso: "/api/plans",
      descrizione: "Crea un piano, vuoto o a partire da un modello.",
      corpo: {
        "title?": "string",
        "date?": "data | null",
        "folderId?": "string | null",
        "slotIds?": "string[] — lezioni dell'orario da collegare",
        "fromTemplateId?": "string — copia contenuti e fasi da un modello",
        "manualStart?": "ora | null",
        "manualDuration?": "numero | null — se manca e non ci sono lezioni: ore predefinite × minuti per ora",
      },
      risposta: "Piano",
    },
    { metodo: "GET", percorso: "/api/plans/:id", descrizione: "Un piano completo.", risposta: "Piano" },
    {
      metodo: "PUT",
      percorso: "/api/plans/:id",
      descrizione: "Modifica un piano. Tutti i campi sono facoltativi; phases e slotIds, se presenti, sostituiscono per intero quelli esistenti. Lo stato precedente finisce nello storico (al massimo ogni 5 minuti).",
      corpo: {
        "title?": "string",
        "date?": "data | null",
        "folderId?": "string | null",
        "manualStart?": "ora | null",
        "manualDuration?": "numero 1–600 | null",
        "prerequisiti?": "string",
        "traguardo?": "string",
        "verifica?": "string",
        "obiettiviInsegnamento?": "Obiettivo[] — se non è vuoto, il testo obiettivoInsegnamento viene generato da qui",
        "obiettiviApprendimento?": "Obiettivo[]",
        "obiettivoInsegnamento?": "string — testo libero, usato solo senza obiettivi strutturati",
        "obiettivoApprendimento?": "string",
        "allegati?": "string",
        "allegatiAuto?": "boolean",
        "sezioniExtra?": "{ id, titolo, testo }[]",
        "slotIds?": "string[]",
        "phases?": "Fase[]",
      },
      risposta: "Piano",
    },
    { metodo: "DELETE", percorso: "/api/plans/:id", descrizione: "Elimina un piano o un modello.", risposta: ok },
    {
      metodo: "POST",
      percorso: "/api/plans/:id/duplicate",
      descrizione: "Duplica un piano. Con asTemplate lo salva tra i modelli.",
      corpo: { "asTemplate?": "boolean" },
      risposta: "Piano — la copia",
    },
    { metodo: "GET", percorso: "/api/plans/:id/versions", descrizione: "Le versioni salvate del piano, dalla più recente.", risposta: "Versione[]" },
    {
      metodo: "POST",
      percorso: "/api/plans/:id/versions/:vid/restore",
      descrizione: "Ripristina una versione. Lo stato attuale viene prima salvato come nuova versione.",
      risposta: "Piano",
    },
    {
      metodo: "GET",
      percorso: "/api/plans/:id/pdf",
      descrizione: "Il piano in PDF, nel formato del modello.",
      parametri: { "download?": '"1" per scaricarlo invece di aprirlo nel browser' },
      risposta: "file application/pdf",
    },
    {
      metodo: "POST",
      percorso: "/api/plans/bulk-delete",
      descrizione: "Elimina più piani in una volta.",
      corpo: { ids: "string[]" },
      risposta: "{ deleted: numero }",
    },
    {
      metodo: "POST",
      percorso: "/api/plans/restore",
      descrizione: "Ricrea un piano eliminato (Annulla). Cartella, lezioni ed esercizi che non esistono più vengono lasciati fuori.",
      corpo: { "...": "gli stessi campi di PUT /api/plans/:id, con title obbligatorio", "isTemplate?": "boolean", "exerciseIds?": "string[]" },
      risposta: "Piano (con un id nuovo)",
    },
    {
      metodo: "GET",
      percorso: "/api/plans/:id/previous",
      descrizione: "La lezione precedente della stessa classe e materia con una nota «dopo la lezione».",
      risposta: "{ id, title, date, notaPost } | null",
    },
    { metodo: "GET", percorso: "/api/materials", descrizione: "I materiali già usati nei propri piani, dal più frequente (per i suggerimenti).", risposta: "string[]" },
  ],

  Cartelle: [
    { metodo: "GET", percorso: "/api/folders", descrizione: "Tutte le cartelle (elenco piatto: l'albero si ricostruisce con parentId).", risposta: "Cartella[]" },
    {
      metodo: "POST",
      percorso: "/api/folders",
      descrizione: "Crea una cartella.",
      corpo: { name: "string", "parentId?": "string | null", "color?": "colore" },
      risposta: "Cartella",
    },
    {
      metodo: "PATCH",
      percorso: "/api/folders/:id",
      descrizione: "Rinomina, colora o sposta una cartella.",
      corpo: { "name?": "string", "parentId?": "string | null", "color?": "colore" },
      risposta: ok,
      errori: { 400: "una cartella non può finire dentro sé stessa" },
    },
    { metodo: "DELETE", percorso: "/api/folders/:id", descrizione: "Elimina la cartella e le sottocartelle. I piani restano, senza cartella.", risposta: ok },
    {
      metodo: "POST",
      percorso: "/api/folders/paste",
      descrizione:
        'Incolla cartelle e piani in una cartella. "copy" li copia (una cartella con tutto il suo contenuto, i nomi doppi diventano "… (copia)"); "cut" li sposta.',
      corpo: {
        op: '"copy" | "cut"',
        "planIds?": "string[]",
        "folderIds?": "string[]",
        targetFolderId: "string | null — null = fuori dalle cartelle",
      },
      risposta:
        'copy: { op, createdFolders: string[], createdPlans: string[], planMap: { planId, sourceId }[] }; cut: { op, movedFolders: { id, from }[], movedPlans: { id, from }[], planMap }',
      errori: { 400: "cartella o piano non valido, oppure una cartella spostata dentro sé stessa" },
    },
  ],

  Esercizi: [
    {
      metodo: "GET",
      percorso: "/api/exercises",
      descrizione: "Gli esercizi caricati, dal più recente, con i piani collegati.",
      parametri: { "q?": "testo cercato in titolo e nome del file" },
      risposta: "Esercizio[]",
    },
    {
      metodo: "POST",
      percorso: "/api/exercises",
      descrizione:
        "Carica uno o più file (multipart/form-data): PDF, Word, Excel, PowerPoint, OpenDocument, immagini, testo, GeoGebra, zip. Massimo 15 MB per file, 20 file per volta.",
      corpo: { file: "uno o più file", "title?": "string (solo con un file)", "planId?": "string — li collega subito a questo piano" },
      risposta: "Esercizio[]",
      errori: { 400: "tipo di file non ammesso, file troppo grande o PDF non valido" },
    },
    { metodo: "GET", percorso: "/api/exercises/:id", descrizione: "Un esercizio.", risposta: "Esercizio" },
    { metodo: "PATCH", percorso: "/api/exercises/:id", descrizione: "Cambia titolo o nota.", corpo: { "title?": "string", "note?": "string" }, risposta: "Esercizio" },
    { metodo: "DELETE", percorso: "/api/exercises/:id", descrizione: "Elimina l'esercizio e i suoi collegamenti (i piani restano).", risposta: ok },
    {
      metodo: "GET",
      percorso: "/api/exercises/:id/file",
      descrizione: "Il file. PDF, immagini e testo si aprono nel browser, gli altri formati si scaricano.",
      parametri: { "download?": '"1" per scaricarlo sempre' },
      risposta: "il file",
    },
    { metodo: "POST", percorso: "/api/exercises/:id/plans/:planId", descrizione: "Collega l'esercizio a un piano.", risposta: "Esercizio" },
    { metodo: "DELETE", percorso: "/api/exercises/:id/plans/:planId", descrizione: "Toglie il collegamento (il file resta).", risposta: "Esercizio" },
  ],

  "Fasi predefinite": [
    { metodo: "GET", percorso: "/api/phase-templates", descrizione: "Le fasi pronte da aggiungere a un piano.", risposta: "FasePredefinita[]" },
    {
      metodo: "POST",
      percorso: "/api/phase-templates",
      descrizione: "Aggiunge una fase predefinita.",
      corpo: { name: "string", "modality?": "string", durationMin: "numero 1–600" },
      risposta: "FasePredefinita",
    },
    {
      metodo: "PUT",
      percorso: "/api/phase-templates/:id",
      descrizione: "Modifica una fase predefinita.",
      corpo: { name: "string", "modality?": "string", durationMin: "numero 1–600" },
      risposta: ok,
    },
    { metodo: "DELETE", percorso: "/api/phase-templates/:id", descrizione: "Elimina una fase predefinita.", risposta: ok },
  ],

  Impostazioni: [
    { metodo: "GET", percorso: "/api/settings", descrizione: "Le impostazioni dell'utente.", risposta: "Impostazioni" },
    {
      metodo: "PUT",
      percorso: "/api/settings",
      descrizione: "Modifica le impostazioni. La chiave AI viene salvata cifrata e non viene mai restituita.",
      corpo: {
        "lessonMinutes?": "numero 10–180",
        "defaultHours?": "numero 1–4",
        "aiProvider?": '"anthropic" | "google" | "openai" | "" (vuoto = disattivato)',
        "aiModel?": "string",
        "aiKey?": "{ provider, key: string | null } — null cancella la chiave di quel fornitore",
      },
      risposta: "Impostazioni",
    },
    {
      metodo: "POST",
      percorso: "/api/settings/calendars",
      descrizione: "Collega un calendario iCal in sola lettura. Il link viene provato subito.",
      corpo: { name: "string", url: "string — https:// (o webcal://)", "asHolidays?": "boolean — gli eventi di giornata intera valgono come vacanze" },
      risposta: "Impostazioni",
      errori: { 400: "link non valido, non raggiungibile o non è un calendario; al massimo 5 calendari" },
    },
    { metodo: "DELETE", percorso: "/api/settings/calendars/:id", descrizione: "Scollega un calendario.", risposta: "Impostazioni" },
    { metodo: "GET", percorso: "/api/verbs", descrizione: "I verbi consentiti per gli obiettivi.", risposta: "Verbo[]" },
    {
      metodo: "POST",
      percorso: "/api/verbs",
      descrizione: "Aggiunge un verbo.",
      corpo: { kind: '"insegnamento" | "apprendimento"', text: "string, fino a 60 caratteri" },
      risposta: "Verbo",
      errori: { 409: "verbo già in elenco" },
    },
    { metodo: "DELETE", percorso: "/api/verbs/:id", descrizione: "Toglie un verbo dall'elenco.", risposta: ok },
    { metodo: "GET", percorso: "/api/school-years", descrizione: "Gli anni scolastici, dal più recente.", risposta: "Periodo[]" },
    {
      metodo: "POST",
      percorso: "/api/school-years",
      descrizione: 'Aggiunge un anno scolastico e crea la sua cartella ("Anno 2027/2028").',
      corpo: periodoCorpo,
      risposta: "Periodo con folderId",
    },
    {
      metodo: "POST",
      percorso: "/api/school-years/import",
      descrizione:
        "Legge un calendario scolastico (es. il PDF del Cantone Ticino) e restituisce anno e vacanze trovati, senza salvare. JSON { url } o { text }, oppure multipart con il campo file (PDF).",
      corpo: { "url?": "indirizzo https di un PDF", "text?": "testo del calendario" },
      risposta: "{ year: { name, startDate, endDate } | null, holidays: { name, startDate, endDate }[], warnings: string[] }",
      errori: { 400: "documento non leggibile o senza date" },
    },
    {
      metodo: "POST",
      percorso: "/api/school-years/import/apply",
      descrizione:
        "Salva anno e vacanze letti. Un anno che si sovrappone viene aggiornato; se l'anno è nuovo viene creata anche la sua cartella. Le vacanze con le stesse date non si duplicano.",
      corpo: { year: "{ name, startDate, endDate }", holidays: "{ name, startDate, endDate }[]" },
      risposta: "{ yearId, created: boolean, folderId: string | null, holidaysAdded, holidaysSkipped }",
    },
    { metodo: "PUT", percorso: "/api/school-years/:id", descrizione: "Modifica un anno scolastico.", corpo: periodoCorpo, risposta: ok },
    { metodo: "DELETE", percorso: "/api/school-years/:id", descrizione: "Elimina un anno scolastico (lezioni e piani restano).", risposta: ok },
    { metodo: "GET", percorso: "/api/holidays", descrizione: "Le vacanze inserite a mano, in ordine di data.", risposta: "Periodo[]" },
    { metodo: "POST", percorso: "/api/holidays", descrizione: "Aggiunge una vacanza o un giorno senza scuola.", corpo: periodoCorpo, risposta: "Periodo" },
    { metodo: "DELETE", percorso: "/api/holidays/:id", descrizione: "Elimina una vacanza.", risposta: ok },
    {
      metodo: "GET",
      percorso: "/api/settings/tokens",
      descrizione: "I token API e i link del calendario (solo con la sessione, non con un token).",
      risposta: "Token[]",
    },
    {
      metodo: "POST",
      percorso: "/api/settings/tokens",
      descrizione: "Crea un token. Il valore compare solo in questa risposta (solo con la sessione).",
      corpo: { name: "string", scope: '"read" | "write" | "feed"', "expiresInDays?": "numero | null" },
      risposta: "Token con token: string",
    },
    { metodo: "DELETE", percorso: "/api/settings/tokens/:id", descrizione: "Revoca un token (solo con la sessione).", risposta: ok },
    {
      metodo: "GET",
      percorso: "/api/export",
      descrizione: "Copia di sicurezza di tutti i propri dati in JSON (senza password, token, chiavi, link dei calendari e file degli esercizi).",
      risposta: "file JSON da scaricare",
    },
  ],

  "Assistente AI": [
    {
      metodo: "GET",
      percorso: "/api/ai/models",
      descrizione: "I modelli utilizzabili con la chiave salvata, letti dal fornitore.",
      parametri: { provider: '"anthropic" | "google" | "openai"' },
      risposta: { models: "string[]", suggested: "string — modello proposto (può essere vuoto)" },
      errori: { 400: "nessuna chiave salvata per quel fornitore", 502: "il fornitore ha rifiutato la chiave o non risponde" },
    },
    {
      metodo: "POST",
      percorso: "/api/ai/chat",
      descrizione: "Conversazione con l'assistente su un piano. L'assistente legge il piano dal server e non lo modifica: può solo proporre.",
      corpo: {
        planId: "string",
        messages: '{ role: "user" | "assistant", content: string }[] — da 1 a 40, l\'intera conversazione',
      },
      risposta:
        'flusso application/x-ndjson: una riga JSON per evento, { t: "text", v: string } (pezzo di risposta), { t: "proposal", v: Proposta }, { t: "error", v: string }',
      errori: { 400: "assistente non configurato nelle Impostazioni" },
    },
  ],

  Servizio: [
    { metodo: "GET", percorso: "/api", descrizione: "Questo documento.", autenticazione: false, risposta: "la descrizione delle API" },
    {
      metodo: "GET",
      percorso: "/api/health",
      descrizione: "Controllo di salute: risponde solo se anche il database funziona, e dice quale versione è in esecuzione.",
      autenticazione: false,
      risposta: { ok: "true", version: "string — il commit in produzione" },
    },
  ],
};

export const apiDocs = {
  nome: "PianoStudio API",
  descrizione: "API del sito per creare i piani lezione. Tutte le richieste e le risposte sono in JSON, salvo dove indicato.",
  autenticazione: {
    tipo: "cookie di sessione oppure token API",
    cookie: "ps_session (httpOnly), impostato da /api/auth/register e /api/auth/login; dura 30 giorni",
    token:
      'Intestazione "Authorization: Bearer ps_…", con un token creato in Impostazioni → Accesso API. Ambito "read": solo GET; "write": tutte le operazioni. Con un token non si possono gestire token, chiavi AI, calendari collegati e impostazioni.',
    regola:
      "Tutte le rotte richiedono la sessione o un token, tranne quelle con autenticazione: false. Ogni utente vede e modifica solo i propri dati: una risorsa altrui risponde 404.",
  },
  convenzioni: {
    corpo: 'Le richieste con corpo vogliono l\'intestazione "Content-Type: application/json". Nei campi, "?" dopo il nome significa facoltativo.',
    errori: 'Gli errori hanno la forma { error: string } con un messaggio in italiano.',
    codici: {
      400: "dati non validi",
      401: "sessione mancante o scaduta, token non valido",
      403: "operazione non permessa con questo token",
      404: "risorsa inesistente o di un altro utente",
      409: "conflitto (es. doppione)",
      500: "errore interno",
    },
    ok: `Le operazioni senza dati da restituire rispondono ${ok}.`,
  },
  tipi,
  gruppi: Object.fromEntries(
    Object.entries(gruppi).map(([nome, endpoints]) => [
      nome,
      endpoints.map((e) => ({ ...e, autenticazione: e.autenticazione ?? true })),
    ]),
  ),
};
