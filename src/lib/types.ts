// Forme dei dati scambiati tra API e frontend.

export type SezioneExtra = { id: string; titolo: string; testo: string };

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
