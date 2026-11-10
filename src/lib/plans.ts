// Accesso ai piani lezione lato server. Ogni funzione è vincolata all'utente.

import type { Prisma } from "@/generated/prisma/client";
import { db } from "./db";
import { ApiError, notFound } from "./http";
import { toMin } from "./schedule";
import type { PhaseDTO, PlanDTO, PlanSummary, SezioneExtra, SlotDTO } from "./types";

const planInclude = {
  phases: { orderBy: { order: "asc" } },
  slots: { include: { slot: true } },
} satisfies Prisma.LessonPlanInclude;

type PlanRow = Prisma.LessonPlanGetPayload<{ include: typeof planInclude }>;

function parseSezioni(json: string): SezioneExtra[] {
  try {
    const v = JSON.parse(json);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

export function toSlotDTO(s: {
  id: string;
  weekday: number;
  startTime: string;
  endTime: string;
  subject: string;
  className: string;
  room: string;
  color: string;
}): SlotDTO {
  return {
    id: s.id,
    weekday: s.weekday,
    startTime: s.startTime,
    endTime: s.endTime,
    subject: s.subject,
    className: s.className,
    room: s.room,
    color: s.color,
  };
}

export function toPlanDTO(p: PlanRow): PlanDTO {
  const slots = p.slots
    .map((ps) => toSlotDTO(ps.slot))
    .sort((a, b) => toMin(a.startTime) - toMin(b.startTime));
  return {
    id: p.id,
    folderId: p.folderId,
    title: p.title,
    date: p.date,
    manualStart: p.manualStart,
    manualDuration: p.manualDuration,
    prerequisiti: p.prerequisiti,
    obiettivoInsegnamento: p.obiettivoInsegnamento,
    traguardo: p.traguardo,
    obiettivoApprendimento: p.obiettivoApprendimento,
    verifica: p.verifica,
    allegati: p.allegati,
    allegatiAuto: p.allegatiAuto,
    sezioniExtra: parseSezioni(p.sezioniExtra),
    isTemplate: p.isTemplate,
    slotIds: slots.map((s) => s.id),
    slots,
    phases: p.phases.map(
      (ph): PhaseDTO => ({
        id: ph.id,
        name: ph.name,
        modality: ph.modality,
        durationMin: ph.durationMin,
        obiettiviSpecifici: ph.obiettiviSpecifici,
        descrizione: ph.descrizione,
        prodottoAtteso: ph.prodottoAtteso,
        materiale: ph.materiale,
      }),
    ),
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  };
}

export async function getPlan(userId: string, id: string): Promise<PlanDTO> {
  const p = await db.lessonPlan.findFirst({ where: { id, userId }, include: planInclude });
  if (!p) throw notFound();
  return toPlanDTO(p);
}

export async function listPlans(
  userId: string,
  where: Prisma.LessonPlanWhereInput,
  take?: number,
): Promise<PlanSummary[]> {
  const rows = await db.lessonPlan.findMany({
    where: { ...where, userId },
    orderBy: { updatedAt: "desc" },
    take,
    include: {
      phases: { select: { durationMin: true } },
      slots: { select: { slotId: true } },
    },
  });
  return rows.map((p) => ({
    id: p.id,
    folderId: p.folderId,
    title: p.title,
    date: p.date,
    isTemplate: p.isTemplate,
    slotIds: p.slots.map((s) => s.slotId),
    phaseCount: p.phases.length,
    totalMin: p.phases.reduce((s, ph) => s + ph.durationMin, 0),
    updatedAt: p.updatedAt.toISOString(),
  }));
}

/** Verifica che cartella e slot indicati appartengano all'utente. */
export async function assertOwned(
  userId: string,
  refs: { folderId?: string | null; slotIds?: string[] },
) {
  if (refs.folderId) {
    const f = await db.folder.findFirst({ where: { id: refs.folderId, userId }, select: { id: true } });
    if (!f) throw new ApiError(400, "Cartella non valida");
  }
  if (refs.slotIds?.length) {
    const n = await db.timetableSlot.count({ where: { id: { in: refs.slotIds }, userId } });
    if (n !== new Set(refs.slotIds).size) throw new ApiError(400, "Lezione non valida");
  }
}

// --- Storico versioni ---

const SNAPSHOT_EVERY_MS = 5 * 60_000;
const MAX_VERSIONS = 30;

/** I campi di un piano che vengono salvati in una versione. */
export type Snapshot = Pick<
  PlanDTO,
  | "title"
  | "prerequisiti"
  | "obiettivoInsegnamento"
  | "traguardo"
  | "obiettivoApprendimento"
  | "verifica"
  | "allegati"
  | "allegatiAuto"
  | "sezioniExtra"
  | "phases"
>;

export function toSnapshot(p: PlanDTO): Snapshot {
  return {
    title: p.title,
    prerequisiti: p.prerequisiti,
    obiettivoInsegnamento: p.obiettivoInsegnamento,
    traguardo: p.traguardo,
    obiettivoApprendimento: p.obiettivoApprendimento,
    verifica: p.verifica,
    allegati: p.allegati,
    allegatiAuto: p.allegatiAuto,
    sezioniExtra: p.sezioniExtra,
    phases: p.phases,
  };
}

/**
 * Salva lo stato attuale del piano come versione. Con `force: false` lo fa
 * al massimo una volta ogni 5 minuti, così l'autosave non riempie lo storico.
 */
export async function snapshotPlan(plan: PlanDTO, force = false) {
  const snapshot = JSON.stringify(toSnapshot(plan));
  const last = await db.planVersion.findFirst({
    where: { planId: plan.id },
    orderBy: { createdAt: "desc" },
  });
  if (last?.snapshot === snapshot) return;
  if (!force && last && Date.now() - last.createdAt.getTime() < SNAPSHOT_EVERY_MS) return;

  await db.planVersion.create({ data: { planId: plan.id, snapshot } });
  const old = await db.planVersion.findMany({
    where: { planId: plan.id },
    orderBy: { createdAt: "desc" },
    skip: MAX_VERSIONS,
    select: { id: true },
  });
  if (old.length) await db.planVersion.deleteMany({ where: { id: { in: old.map((v) => v.id) } } });
}

export function phaseRows(phases: PhaseDTO[], keepIds: boolean) {
  return phases.map((ph, order) => ({
    ...(keepIds ? { id: ph.id } : {}),
    order,
    name: ph.name,
    modality: ph.modality,
    durationMin: ph.durationMin,
    obiettiviSpecifici: ph.obiettiviSpecifici,
    descrizione: ph.descrizione,
    prodottoAtteso: ph.prodottoAtteso,
    materiale: ph.materiale,
  }));
}

/** Copia contenuti e fasi di un piano in uno nuovo. */
export async function clonePlan(
  userId: string,
  source: PlanDTO,
  overrides: {
    title: string;
    isTemplate: boolean;
    folderId?: string | null;
    date?: string | null;
    slotIds?: string[];
    keepTiming?: boolean;
  },
): Promise<PlanDTO> {
  const created = await db.lessonPlan.create({
    data: {
      userId,
      title: overrides.title,
      isTemplate: overrides.isTemplate,
      folderId: overrides.folderId ?? null,
      date: overrides.date ?? null,
      manualStart: overrides.keepTiming ? source.manualStart : null,
      manualDuration: overrides.keepTiming ? source.manualDuration : null,
      prerequisiti: source.prerequisiti,
      obiettivoInsegnamento: source.obiettivoInsegnamento,
      traguardo: source.traguardo,
      obiettivoApprendimento: source.obiettivoApprendimento,
      verifica: source.verifica,
      allegati: source.allegati,
      allegatiAuto: source.allegatiAuto,
      sezioniExtra: JSON.stringify(source.sezioniExtra),
      phases: { create: phaseRows(source.phases, false) },
      slots: { create: (overrides.slotIds ?? []).map((slotId) => ({ slotId })) },
    },
  });
  return getPlan(userId, created.id);
}
