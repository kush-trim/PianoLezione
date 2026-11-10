import { z } from "zod";

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "orario non valido");
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "data non valida");
const text = z.string().max(20_000);
const short = z.string().trim().max(200);

export const COLORS = ["slate", "blue", "teal", "green", "amber", "orange", "rose", "violet"] as const;
const color = z.enum(COLORS);

export const registerSchema = z.object({
  name: short.min(1, "inserisci il nome"),
  email: z.string().trim().toLowerCase().pipe(z.email("email non valida")),
  password: z.string().min(8, "la password deve avere almeno 8 caratteri").max(200),
});

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase(),
  password: z.string(),
});

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
  verifica: text.optional(),
  allegati: text.optional(),
  allegatiAuto: z.boolean().optional(),
  sezioniExtra: z
    .array(z.object({ id: z.string().max(64), titolo: short, testo: text }))
    .max(30)
    .optional(),
  slotIds: z.array(z.string()).max(12).optional(),
  phases: z.array(phaseSchema).max(100).optional(),
});

export const planCreateSchema = z.object({
  title: short.optional(),
  date: date.nullable().optional(),
  folderId: z.string().nullable().optional(),
  slotIds: z.array(z.string()).max(12).optional(),
  fromTemplateId: z.string().optional(),
});

export const phaseTemplateSchema = z.object({
  name: short.min(1),
  modality: short.default(""),
  durationMin: z.number().int().min(1).max(600),
});

export const dateParam = date;
