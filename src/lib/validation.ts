import { z } from "zod";
import { THEME_IDS } from "./theme";

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "orario non valido");
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "data non valida");
const text = z.string().max(20_000);
const short = z.string().trim().max(200);

export const COLORS = ["slate", "blue", "teal", "green", "amber", "orange", "rose", "violet"] as const;
const color = z.enum(COLORS);

export const folderCreateSchema = z.object({
  name: short.min(1),
  parentId: z.string().nullable().optional(),
  color: color.optional(),
});

export const folderUpdateSchema = z.object({
  name: short.min(1).optional(),
  parentId: z.string().nullable().optional(),
  color: color.optional(),
});

export const slotSchema = z
  .object({
    weekday: z.number().int().min(1).max(7),
    startTime: time,
    endTime: time,
    subject: short.min(1, "inserisci la materia"),
    className: short.default(""),
    room: short.default(""),
    color: color.default("blue"),
    validFrom: date.nullable().optional(),
    validTo: date.nullable().optional(),
  })
  .refine((s) => s.endTime > s.startTime, "la fine deve essere dopo l'inizio");

export const phaseSchema = z.object({
  id: z.string().min(1).max(64),
  name: short,
  modality: short,
  durationMin: z.number().int().min(0).max(600),
  obiettiviSpecifici: text,
  descrizione: text,
  prodottoAtteso: text,
  materiale: text,
});

const obiettivo = z.object({ id: z.string().min(1).max(64), verbo: short, testo: z.string().max(2000) });

export const planUpdateSchema = z.object({
  folderId: z.string().nullable().optional(),
  title: short.optional(),
  date: date.nullable().optional(),
  manualStart: time.nullable().optional(),
  manualDuration: z.number().int().min(1).max(600).nullable().optional(),
  prerequisiti: text.optional(),
  obiettivoInsegnamento: text.optional(),
  traguardo: text.optional(),
  obiettivoApprendimento: text.optional(),
  obiettiviInsegnamento: z.array(obiettivo).max(30).optional(),
  obiettiviApprendimento: z.array(obiettivo).max(30).optional(),
  verifica: text.optional(),
  allegati: text.optional(),
  allegatiAuto: z.boolean().optional(),
  sezioniExtra: z
    .array(z.object({ id: z.string().max(64), titolo: short, testo: text }))
    .max(30)
    .optional(),
  notaPost: text.optional(),
  slotIds: z.array(z.string()).max(12).optional(),
  phases: z.array(phaseSchema).max(100).optional(),
});

export const planCreateSchema = z.object({
  title: short.optional(),
  date: date.nullable().optional(),
  folderId: z.string().nullable().optional(),
  slotIds: z.array(z.string()).max(12).optional(),
  fromTemplateId: z.string().optional(),
  manualStart: time.nullable().optional(),
  manualDuration: z.number().int().min(1).max(600).nullable().optional(),
});

export const phaseTemplateSchema = z.object({
  name: short.min(1),
  modality: short.default(""),
  durationMin: z.number().int().min(1).max(600),
});

export const dateParam = date;

// --- Impostazioni, anno scolastico, eventi ---

const provider = z.enum(["anthropic", "google", "openai"]);
const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, "colore non valido").transform((s) => s.toLowerCase());

export const settingsSchema = z.object({
  lessonMinutes: z.number().int().min(10).max(180).optional(),
  defaultHours: z.number().int().min(1).max(4).optional(),
  aiProvider: provider.or(z.literal("")).optional(),
  aiModel: z.string().trim().max(100).optional(),
  // key: null cancella la chiave salvata per quel fornitore.
  aiKey: z.object({ provider, key: z.string().trim().min(8).max(400).nullable() }).optional(),
  theme: z.enum(THEME_IDS).optional(),
  customTheme: z
    .object({ scheme: z.enum(["light", "dark"]), paper: hex, ink: hex, accent: hex })
    .optional(),
});

export const calendarSchema = z.object({
  name: short.min(1),
  url: z.string().trim().min(10).max(2000),
  asHolidays: z.boolean().default(false),
});

export const verbSchema = z.object({
  kind: z.enum(["insegnamento", "apprendimento"]),
  text: z.string().trim().min(1).max(60),
});

const period = z
  .object({ name: short.min(1), startDate: date, endDate: date })
  .refine((p) => p.endDate >= p.startDate, "la fine deve essere uguale o successiva all'inizio");

export const schoolYearSchema = period;
export const holidaySchema = period;

export const exceptionSchema = z
  .object({
    kind: z.enum(["annullata", "modificata"]),
    startTime: time.nullable().optional(),
    endTime: time.nullable().optional(),
    room: short.nullable().optional(),
    note: z.string().trim().max(500).default(""),
  })
  .refine((e) => !e.startTime || !e.endTime || e.endTime > e.startTime, "la fine deve essere dopo l'inizio");

export const eventSchema = z
  .object({
    title: short.min(1, "inserisci un titolo"),
    date,
    endDate: date.nullable().optional(),
    startTime: time.nullable().optional(),
    endTime: time.nullable().optional(),
    kind: z.enum(["gita", "altro"]).default("altro"),
    color: color.default("amber"),
    note: z.string().trim().max(500).default(""),
    className: short.default(""),
    cancelsLessons: z.boolean().default(false),
  })
  .refine((e) => !e.startTime || !e.endTime || e.endTime > e.startTime, "la fine deve essere dopo l'inizio")
  .refine((e) => !e.endDate || e.endDate >= e.date, "l'ultimo giorno non può essere prima del primo")
  // Un evento di un giorno solo si salva senza endDate.
  .transform((e) => ({ ...e, endDate: e.endDate && e.endDate > e.date ? e.endDate : null }));

// Modifica o chiusura di una lezione ricorrente "da questa settimana in poi".
export const slotSplitSchema = z.object({ from: date, slot: slotSchema });
export const slotEndSchema = z.object({ from: date });

export const chatSchema = z.object({
  planId: z.string(),
  messages: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(20_000) }))
    .min(1)
    .max(40),
});

// --- Token API ---

export const tokenCreateSchema = z.object({
  name: short.min(1, "dai un nome al token"),
  scope: z.enum(["read", "write", "feed"]),
  expiresInDays: z.number().int().min(1).max(3650).nullable().optional(),
});

// --- Cartelle: incolla (copia o sposta) ---

export const pasteSchema = z.object({
  op: z.enum(["copy", "cut"]),
  planIds: z.array(z.string()).max(500).default([]),
  folderIds: z.array(z.string()).max(200).default([]),
  targetFolderId: z.string().nullable(),
});

// Ripristino di un piano eliminato (annulla): il piano com'era, senza id.
export const planRestoreSchema = planUpdateSchema.extend({
  title: short,
  isTemplate: z.boolean().default(false),
  exerciseIds: z.array(z.string()).max(200).optional(),
});

// --- Nuovo anno: in quale settimana fare i piani copiati ---

export const proposeSchema = z.object({
  targetFolderId: z.string(),
  // planId = il piano nella cartella dell'anno; sourceId = il piano da cui è stato copiato.
  plans: z
    .array(z.object({ planId: z.string(), sourceId: z.string().optional() }))
    .min(1)
    .max(500),
});

// --- Calendario scolastico da PDF ---

export const calendarImportSchema = z.object({
  url: z.string().trim().url().max(2000).optional(),
  text: z.string().max(200_000).optional(),
});

export const calendarApplySchema = z.object({
  year: z.object({ name: short.min(1), startDate: date, endDate: date }),
  holidays: z.array(z.object({ name: short.min(1), startDate: date, endDate: date })).max(100),
});

// --- Esercizi ---

export const exerciseUpdateSchema = z.object({
  title: short.min(1).optional(),
  note: z.string().trim().max(2000).optional(),
  /** Sposta il file in questa cartella (dello stesso Drive). */
  folderId: z.string().min(1).optional(),
  /** Etichette (le pulisce normalizeTags). */
  tags: z.array(z.string().max(100)).max(50).optional(),
});

// --- Cartelle di esercizi (Google Drive) ---

export const materialFolderSchema = z.object({
  name: z.string().trim().min(1, "inserisci un nome").max(100),
});

/** Cambia nome e/o posto (parentId null: tra le cartelle principali). */
export const materialFolderUpdateSchema = z
  .object({
    name: z.string().trim().min(1, "inserisci un nome").max(100).optional(),
    parentId: z.string().min(1).nullable().optional(),
  })
  .refine((v) => v.name !== undefined || v.parentId !== undefined, "indica il nuovo nome o la nuova cartella");

export const materialFolderCreateSchema = materialFolderSchema.extend({
  /** Con parentId è una sottocartella. */
  parentId: z.string().min(1).nullable().optional(),
});

export const inviteSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email("email non valida")),
});
