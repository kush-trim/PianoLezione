// Forme dei dati scambiati tra API e frontend.

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

export type UserDTO = { id: string; name: string; email: string };

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
  date: string;
  startTime: string | null;
  endTime: string | null;
  kind: "gita" | "altro";
  color: string;
  note: string;
  /** Classe coinvolta ("" = tutte). */
  className: string;
  /** Le lezioni della classe quel giorno (o in quegli orari) non si tengono. */
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

export type ExerciseRef = { id: string; title: string; fileName: string; size: number };

export type ExerciseDTO = ExerciseRef & {
  note: string;
  createdAt: string;
  /** I piani a cui è collegato (anche nessuno). */
  plans: { id: string; title: string; date: string | null }[];
};
