// Motore orari: funzioni pure, usate da editor, API ed export PDF.

export type Interval = { start: number; end: number }; // minuti da mezzanotte

export type PhaseTiming = {
  start: number;
  end: number;
  /** La fase inizia in una lezione e finisce nella successiva, a cavallo della pausa. */
  crossesBreak: boolean;
  /** La fase finisce dopo il termine della lezione. */
  overflow: boolean;
};

export type Schedule = {
  /** false se non c'è un orario di inizio: i tempi sono relativi (da 0). */
  hasClock: boolean;
  phases: PhaseTiming[];
  total: number;
  /** Minuti disponibili nella lezione; null se la fine non è nota. */
  available: number | null;
  /** available - total: positivo = minuti liberi, negativo = in eccesso. */
  diff: number | null;
};

export function toMin(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

export function fromMin(min: number): string {
  const m = ((Math.round(min) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

/** Ordina gli intervalli e unisce quelli contigui o sovrapposti. */
export function normalizeIntervals(intervals: Interval[]): Interval[] {
  const sorted = intervals
    .filter((i) => i.end > i.start)
    .sort((a, b) => a.start - b.start);
  const out: Interval[] = [];
  for (const i of sorted) {
    const last = out[out.length - 1];
    if (last && i.start <= last.end) last.end = Math.max(last.end, i.end);
    else out.push({ ...i });
  }
  return out;
}

/**
 * Dispone le fasi in sequenza dentro gli intervalli della lezione.
 * Le pause tra un intervallo e l'altro vengono saltate.
 */
export function computeSchedule(rawIntervals: Interval[], durations: number[]): Schedule {
  const intervals = normalizeIntervals(rawIntervals);
  const total = durations.reduce((s, d) => s + Math.max(0, d), 0);

  if (intervals.length === 0) {
    let cursor = 0;
    const phases = durations.map((d) => {
      const start = cursor;
      cursor += Math.max(0, d);
      return { start, end: cursor, crossesBreak: false, overflow: false };
    });
    return { hasClock: false, phases, total, available: null, diff: null };
  }

  const openEnded = !Number.isFinite(intervals[intervals.length - 1].end);
  const available = openEnded
    ? null
    : intervals.reduce((s, i) => s + (i.end - i.start), 0);

  let idx = 0;
  let cursor = intervals[0].start;
  const phases: PhaseTiming[] = durations.map((raw) => {
    let remaining = Math.max(0, raw);
    // Se la lezione corrente è finita, la fase parte dopo la pausa.
    if (remaining > 0 && cursor >= intervals[idx].end && idx < intervals.length - 1) {
      idx++;
      cursor = intervals[idx].start;
    }
    const start = cursor;
    let crossesBreak = false;
    let overflow = false;
    while (remaining > 0) {
      const room = intervals[idx].end - cursor;
      if (remaining <= room) {
        cursor += remaining;
        remaining = 0;
      } else if (idx < intervals.length - 1) {
        remaining -= Math.max(0, room);
        idx++;
        cursor = intervals[idx].start;
        crossesBreak = true;
      } else {
        cursor += remaining;
        remaining = 0;
        overflow = true;
      }
    }
    return { start, end: cursor, crossesBreak, overflow };
  });

  return {
    hasClock: true,
    phases,
    total,
    available,
    diff: available === null ? null : available - total,
  };
}

/**
 * Ridistribuisce i minuti liberi (o in eccesso) tra le fasi in proporzione
 * alla loro durata, arrotondando al passo indicato. La somma del risultato
 * è uguale a `available`, a meno che le fasi siano troppe per starci.
 */
export function redistribute(durations: number[], available: number, step = 5): number[] {
  const n = durations.length;
  const total = durations.reduce((s, d) => s + d, 0);
  if (n === 0 || available <= 0) return durations;
  // Troppe fasi per il passo richiesto: si scende a passo 1.
  if (available < n * step) {
    return step > 1 ? redistribute(durations, available, 1) : durations;
  }

  const ideal = durations.map((d) => (total > 0 ? (d * available) / total : available / n));
  const out = ideal.map((x) => Math.max(step, Math.floor(x / step) * step));
  let left = available - out.reduce((s, d) => s + d, 0);

  while (left >= step) {
    let best = 0;
    for (let i = 1; i < n; i++) if (ideal[i] - out[i] > ideal[best] - out[best]) best = i;
    out[best] += step;
    left -= step;
  }
  while (left <= -step) {
    let best = -1;
    for (let i = 0; i < n; i++) {
      if (out[i] <= step) continue;
      if (best === -1 || out[i] - ideal[i] > out[best] - ideal[best]) best = i;
    }
    if (best === -1) break;
    out[best] -= step;
    left += step;
  }
  // Resto inferiore al passo (lezione non multipla di 5'): va alla fase più lunga.
  if (left !== 0) {
    let longest = 0;
    for (let i = 1; i < n; i++) if (out[i] > out[longest]) longest = i;
    if (out[longest] + left >= 1) out[longest] += left;
  }
  return out;
}

/** Intervalli della lezione a partire dagli slot collegati o dall'orario manuale. */
export function planIntervals(plan: {
  slots: { startTime: string; endTime: string }[];
  manualStart: string | null;
  manualDuration: number | null;
}): Interval[] {
  if (plan.slots.length > 0) {
    return plan.slots.map((s) => ({ start: toMin(s.startTime), end: toMin(s.endTime) }));
  }
  if (plan.manualStart) {
    const start = toMin(plan.manualStart);
    return [{ start, end: plan.manualDuration ? start + plan.manualDuration : Infinity }];
  }
  return [];
}
