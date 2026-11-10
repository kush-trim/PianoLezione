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
    { metodo: "POST", percorso: "/api/school-years", descrizione: "Aggiunge un anno scolastico.", corpo: periodoCorpo, risposta: "Periodo" },
    { metodo: "PUT", percorso: "/api/school-years/:id", descrizione: "Modifica un anno scolastico.", corpo: periodoCorpo, risposta: ok },
    { metodo: "DELETE", percorso: "/api/school-years/:id", descrizione: "Elimina un anno scolastico (lezioni e piani restano).", risposta: ok },
    { metodo: "GET", percorso: "/api/holidays", descrizione: "Le vacanze inserite a mano, in ordine di data.", risposta: "Periodo[]" },
    { metodo: "POST", percorso: "/api/holidays", descrizione: "Aggiunge una vacanza o un giorno senza scuola.", corpo: periodoCorpo, risposta: "Periodo" },
    { metodo: "DELETE", percorso: "/api/holidays/:id", descrizione: "Elimina una vacanza.", risposta: ok },
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
      descrizione: "Controllo di salute: risponde solo se anche il database funziona.",
      autenticazione: false,
      risposta: ok,
    },
  ],
};

export const apiDocs = {
  nome: "PianoStudio API",
  descrizione: "API del sito per creare i piani lezione. Tutte le richieste e le risposte sono in JSON, salvo dove indicato.",
  autenticazione: {
    tipo: "cookie di sessione",
    cookie: "ps_session (httpOnly), impostato da /api/auth/register e /api/auth/login; dura 30 giorni",
    regola:
      "Tutte le rotte richiedono la sessione, tranne quelle con autenticazione: false. Ogni utente vede e modifica solo i propri dati: una risorsa altrui risponde 404.",
  },
  convenzioni: {
    corpo: 'Le richieste con corpo vogliono l\'intestazione "Content-Type: application/json". Nei campi, "?" dopo il nome significa facoltativo.',
    errori: 'Gli errori hanno la forma { error: string } con un messaggio in italiano.',
    codici: {
      400: "dati non validi",
      401: "sessione mancante o scaduta",
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
