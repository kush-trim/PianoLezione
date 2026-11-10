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
