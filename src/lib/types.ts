// Forme dei dati scambiati tra API e frontend.

import type { CustomTheme } from "./theme";

export type SezioneExtra = { id: string; titolo: string; testo: string };

/** Un obiettivo strutturato: soggetto fisso (docente / allievo) + verbo dell'elenco + testo. */
export type Obiettivo = { id: string; verbo: string; testo: string };
export type VerbKind = "insegnamento" | "apprendimento";

export type PhaseDTO = {
  id: string;
  name: string;
  modality: string;
  durationMin: number;
  obiettiviSpecifici: string;
  descrizione: string;
  prodottoAtteso: string;
  materiale: string;
};

export type SlotDTO = {
  id: string;
  weekday: number; // 1 = lunedì ... 7 = domenica
  startTime: string; // "HH:MM"
  endTime: string;
  subject: string;
  className: string;
  room: string;
  color: string;
  validFrom: string | null; // "YYYY-MM-DD", estremi inclusi
  validTo: string | null;
};

export type PlanDTO = {
  id: string;
  folderId: string | null;
  title: string;
  date: string | null; // "YYYY-MM-DD"
  manualStart: string | null;
  manualDuration: number | null;
  prerequisiti: string;
  obiettivoInsegnamento: string;
  traguardo: string;
  obiettivoApprendimento: string;
  obiettiviInsegnamento: Obiettivo[];
  obiettiviApprendimento: Obiettivo[];
  verifica: string;
  allegati: string;
  allegatiAuto: boolean;
  sezioniExtra: SezioneExtra[];
  notaPost: string;
  /** Esercizi (PDF) collegati al piano. */
  exercises: ExerciseRef[];
  isTemplate: boolean;
  slotIds: string[];
  slots: SlotDTO[];
  phases: PhaseDTO[];
  createdAt: string;
  updatedAt: string;
};

export type PlanSummary = {
  id: string;
  folderId: string | null;
  title: string;
  date: string | null;
  isTemplate: boolean;
  slotIds: string[];
  phaseCount: number;
  totalMin: number;
  updatedAt: string;
};

export type FolderDTO = {
  id: string;
  parentId: string | null;
  name: string;
  color: string;
  order: number;
  planCount: number;
  /** Cartella di un anno scolastico: i piani copiati dentro vengono riportati in quell'anno. */
  schoolYearId: string | null;
};

export type PhaseTemplateDTO = {
  id: string;
  name: string;
  modality: string;
  durationMin: number;
};

export type VersionDTO = {
  id: string;
  createdAt: string;
  title: string;
  phaseCount: number;
  totalMin: number;
};

export type UserDTO = {
  id: string;
  name: string;
  email: string;
  /** L'account Google collegato e se Google Drive è autorizzato. */
  google: { email: string; driveAuthorized: boolean } | null;
};

export type ExceptionDTO = {
  id: string;
  slotId: string;
  date: string;
  kind: "annullata" | "modificata";
  startTime: string | null;
  endTime: string | null;
  room: string | null;
  note: string;
};

/** Una lezione ricorrente in un giorno preciso, con l'eventuale modifica di quel giorno applicata. */
export type Occurrence = {
  slot: SlotDTO;
  date: string;
  startTime: string;
  endTime: string;
  room: string;
  cancelled: boolean;
  modified: boolean;
  note: string;
};

export type EventDTO = {
  id: string;
  title: string;
  /** Primo giorno. */
  date: string;
  /** Ultimo giorno (incluso) se l'evento dura più giorni; null = un giorno solo. */
  endDate: string | null;
  startTime: string | null;
  endTime: string | null;
  kind: "gita" | "altro";
  color: string;
  note: string;
  /** Classe coinvolta ("" = tutte). */
  className: string;
  /** Le lezioni della classe in quei giorni (o in quegli orari) non si tengono. */
  cancelsLessons: boolean;
};

/** Evento letto da un calendario esterno (iCal), già riportato al singolo giorno. */
export type ExternalEvent = {
  title: string;
  date: string;
  startTime: string | null;
  endTime: string | null;
  calendar: string;
};

export type SchoolYearDTO = { id: string; name: string; startDate: string; endDate: string };
export type HolidayDTO = { id: string; name: string; startDate: string; endDate: string };
export type VerbDTO = { id: string; kind: VerbKind; text: string };

export type AiProvider = "anthropic" | "google" | "openai";

export type SettingsDTO = {
  lessonMinutes: number;
  defaultHours: number;
  aiProvider: AiProvider | "";
  aiModel: string;
  /** Per quali fornitori è stata salvata una chiave (la chiave non esce mai dal server). */
  aiKeys: Record<AiProvider, boolean>;
  calendars: { id: string; name: string; host: string; asHolidays: boolean }[];
  /** Id di un tema pronto oppure "custom". */
  theme: string;
  /** Il tema personalizzato salvato, anche quando non è quello in uso. */
  customTheme: CustomTheme | null;
};

export type WeekDTO = {
  monday: string;
  days: string[];
  slots: SlotDTO[];
  exceptions: ExceptionDTO[];
  events: EventDTO[];
  external: ExternalEvent[];
  /** Giorni di vacanza della settimana (a mano + calendari). */
  holidays: { date: string; name: string }[];
  plans: PlanSummary[];
  year: SchoolYearDTO | null;
  weekNumber: number | null;
  settings: { lessonMinutes: number; defaultHours: number };
  /** Calendari esterni che non è stato possibile leggere. */
  calendarErrors: string[];
};

export type ApiTokenDTO = {
  id: string;
  name: string;
  prefix: string;
  scope: "read" | "write" | "feed";
  lastUsedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
};

/** Le lezioni rimaste fino alla fine dell'anno, per classe e materia. */
export type ClassRemaining = {
  className: string;
  subject: string;
  color: string;
  /** Lezioni (ore dell'orario) da oggi alla fine dell'anno, senza vacanze e annullamenti. */
  remaining: number;
  remainingMin: number;
  /** Di quelle rimaste, quante hanno già un piano. */
  planned: number;
  /** Lezioni già svolte dall'inizio dell'anno. */
  done: number;
  /** Giorni con almeno una lezione di questa classe e materia. */
  daysLeft: number;
  nextDate: string | null;
};

export type RemainingDTO = {
  year: SchoolYearDTO | null;
  from: string;
  schoolDaysLeft: number;
  weeksLeft: number;
  classes: ClassRemaining[];
};

/** Una lezione di una settimana del nuovo anno, come possibile destinazione di un piano. */
export type LessonOption = {
  date: string;
  slotIds: string[];
  startTime: string;
  endTime: string;
  subject: string;
  className: string;
  /** C'è già un piano su questa lezione. */
  taken: boolean;
};

export type ProposalDTO = {
  year: SchoolYearDTO;
  weeks: { monday: string; number: number; lessons: LessonOption[] }[];
  plans: {
    planId: string;
    title: string;
    /** Data e settimana nell'anno di provenienza. */
    sourceDate: string | null;
    sourceWeek: number | null;
    /** Proposta: settimana (lunedì), data e lezioni. */
    monday: string | null;
    date: string | null;
    slotIds: string[];
  }[];
};

export type CalendarImportDTO = {
  year: { name: string; startDate: string; endDate: string } | null;
  holidays: { name: string; startDate: string; endDate: string }[];
  /** Righe del documento che sembrano date ma non sono state capite. */
  warnings: string[];
};

export type ExerciseRef = {
  id: string;
  title: string;
  fileName: string;
  size: number;
  /** Link per aprirlo: su Google Drive, oppure il file caricato sul sito prima di Drive. */
  url: string;
  /** "drive": su Google Drive; "upload": caricato sul sito prima del passaggio a Drive. */
  source: "drive" | "upload";
  folderId: string | null;
  folderName: string | null;
  /** Etichette: Teoria, Esercizi, Soluzioni, Extra, o libere. */
  tags: string[];
};

export type ExerciseDTO = ExerciseRef & {
  note: string;
  createdAt: string;
  mimeType: string;
  /** Chi l'ha caricato (in una cartella condivisa può essere un collega). */
  uploadedBy: { id: string; name: string } | null;
  /** Il proprietario della cartella: il file sta sul suo Google Drive. */
  owner: { id: string; name: string };
  /** Se è la copia di un file di una cartella altrui: da dove viene. */
  copiedFrom: string | null;
  /** Può rinominarlo o eliminarlo: il proprietario della cartella o chi l'ha caricato. */
  canEdit: boolean;
  /** I miei piani a cui è collegato (anche nessuno). */
  plans: { id: string; title: string; date: string | null }[];
};

export type PersonDTO = { id: string; name: string; email: string };

/** Le etichette usate negli esercizi che vedo, con quanti file le hanno. */
export type TagCountDTO = { tag: string; count: number };

/** Esito della copia di una cartella sul mio Drive. */
export type FolderCopyDTO = { id: string; name: string; folders: number; files: number; failed: string[] };

export type MaterialFolderDTO = {
  id: string;
  name: string;
  /** "I miei file": la cartella personale, che non si elimina. */
  isDefault: boolean;
  /** La cartella che la contiene; null per le cartelle principali. */
  parentId: string | null;
  /** La cartella principale; null se è lei la principale. */
  rootId: string | null;
  /** Rispetto alla cartella principale: proprietario o membro. */
  role: "owner" | "member";
  owner: PersonDTO;
  /** Chi l'ha creata (per una sottocartella può essere un membro). */
  createdBy: PersonDTO | null;
  createdAt: string;
  /** Rinominare ed eliminare: il proprietario, o chi ha creato la sottocartella. */
  canManage: boolean;
  /** Solo nelle cartelle principali: chi ha accesso (vale anche per le sottocartelle). */
  members: (PersonDTO & { joinedAt: string })[];
  /** Inviti in attesa (li vede solo il proprietario, solo nelle cartelle principali). */
  invites: { id: string; email: string; createdAt: string }[];
  /** File direttamente in questa cartella (senza le sottocartelle). */
  fileCount: number;
  /** Byte dei file direttamente in questa cartella. */
  bytes: number;
  /** Quando è stato aggiunto l'ultimo file direttamente in questa cartella. */
  lastFileAt: string | null;
  driveUrl: string;
};

export type FoldersDTO = {
  folders: MaterialFolderDTO[];
  /** false se l'utente non ha autorizzato Google Drive (o l'ha revocato). */
  driveAuthorized: boolean;
};

/** Spazio occupato: i file di PianoStudio sul mio Drive e lo spazio del Drive intero. */
export type StorageDTO = {
  /** File di PianoStudio sul mio Drive (anche quelli caricati dai colleghi nelle mie cartelle). */
  files: number;
  bytes: number;
  /** null se Drive non è autorizzato o non risponde. limit null = spazio illimitato. */
  drive: { usage: number; limit: number | null } | null;
};

export type InviteDTO = {
  id: string;
  folderName: string;
  from: PersonDTO;
  createdAt: string;
};

export type NotificationDTO = { id: string; type: string; text: string; createdAt: string; read: boolean };

export type NotificationsDTO = {
  invites: InviteDTO[];
  items: NotificationDTO[];
  /** Inviti in attesa + avvisi non letti. */
  unread: number;
};
