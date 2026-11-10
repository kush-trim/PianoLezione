import { describe, expect, it } from "vitest";
import {
  computeSchedule,
  fromMin,
  normalizeIntervals,
  planIntervals,
  redistribute,
  toMin,
} from "./schedule";

const iv = (a: string, b: string) => ({ start: toMin(a), end: toMin(b) });
const clock = (s: ReturnType<typeof computeSchedule>) =>
  s.phases.map((p) => `${fromMin(p.start)}-${fromMin(p.end)}`);

// Le fasi dell'esempio "il banco".
const BANCO = [5, 20, 10, 20, 5, 20, 5];

describe("computeSchedule", () => {
  it("dispone le fasi in sequenza", () => {
    const s = computeSchedule([iv("08:20", "09:05")], [5, 20, 10]);
    expect(clock(s)).toEqual(["08:20-08:25", "08:25-08:45", "08:45-08:55"]);
    expect(s.total).toBe(35);
    expect(s.available).toBe(45);
    expect(s.diff).toBe(10);
  });

  it("salta la pausa in una lezione doppia e segnala la fase a cavallo", () => {
    const s = computeSchedule([iv("08:20", "09:05"), iv("09:20", "10:05")], BANCO);
    expect(clock(s)).toEqual([
      "08:20-08:25",
      "08:25-08:45",
      "08:45-08:55",
      "08:55-09:30", // 10' prima della pausa, 10' dopo
      "09:30-09:35",
      "09:35-09:55",
      "09:55-10:00",
    ]);
    expect(s.phases.map((p) => p.crossesBreak)).toEqual([
      false, false, false, true, false, false, false,
    ]);
    expect(s.diff).toBe(5);
  });

  it("fa partire dopo la pausa la fase che inizia a lezione finita", () => {
    const s = computeSchedule([iv("08:00", "08:45"), iv("09:00", "09:45")], [45, 10]);
    expect(clock(s)).toEqual(["08:00-08:45", "09:00-09:10"]);
    expect(s.phases[1].crossesBreak).toBe(false);
  });

  it("unisce le lezioni contigue", () => {
    expect(normalizeIntervals([iv("09:05", "09:50"), iv("08:20", "09:05")])).toEqual([
      iv("08:20", "09:50"),
    ]);
    const s = computeSchedule([iv("08:20", "09:05"), iv("09:05", "09:50")], BANCO);
    expect(s.phases.some((p) => p.crossesBreak)).toBe(false);
    expect(s.diff).toBe(5);
  });

  it("segnala l'eccesso", () => {
    const s = computeSchedule([iv("08:20", "09:05")], [20, 20, 20]);
    expect(s.diff).toBe(-15);
    expect(s.phases.map((p) => p.overflow)).toEqual([false, false, true]);
    expect(clock(s)[2]).toBe("09:00-09:20");
  });

  it("senza orario restituisce tempi relativi", () => {
    const s = computeSchedule([], [5, 20]);
    expect(s.hasClock).toBe(false);
    expect(s.phases.map((p) => [p.start, p.end])).toEqual([
      [0, 5],
      [5, 25],
    ]);
    expect(s.available).toBeNull();
  });

  it("con inizio manuale senza durata non calcola i minuti disponibili", () => {
    const s = computeSchedule(
      planIntervals({ slots: [], manualStart: "10:00", manualDuration: null }),
      [5, 20],
    );
    expect(clock(s)).toEqual(["10:00-10:05", "10:05-10:25"]);
    expect(s.available).toBeNull();
    expect(s.phases.some((p) => p.overflow)).toBe(false);
  });
});

describe("redistribute", () => {
  const sum = (a: number[]) => a.reduce((s, d) => s + d, 0);

  it("riempie i minuti liberi", () => {
    const out = redistribute(BANCO, 90);
    expect(sum(out)).toBe(90);
    expect(out.every((d) => d % 5 === 0 && d >= 5)).toBe(true);
  });

  it("toglie i minuti in eccesso", () => {
    expect(redistribute([20, 20, 20], 45)).toEqual([15, 15, 15]);
  });

  it("mantiene le proporzioni", () => {
    expect(redistribute([10, 30], 80)).toEqual([20, 60]);
  });

  it("gestisce lezioni non multiple di 5'", () => {
    expect(sum(redistribute([10, 20, 10], 47))).toBe(47);
  });

  it("non tocca le durate se sono già giuste", () => {
    expect(redistribute([5, 20, 20], 45)).toEqual([5, 20, 20]);
  });
});

describe("durata dichiarata e sforamento", () => {
  it("senza orario usa la durata dichiarata", () => {
    const s = computeSchedule([], [20, 20, 10], 45);
    expect(s.hasClock).toBe(false);
    expect(s.available).toBe(45);
    expect(s.diff).toBe(-5);
    expect(s.phases.map((p) => p.overflow)).toEqual([false, false, true]);
  });

  it("lo sforamento non ferma il calcolo degli orari", () => {
    const s = computeSchedule([iv("08:00", "08:45")], [30, 30]);
    expect(clock(s)).toEqual(["08:00-08:30", "08:30-09:00"]);
    expect(s.diff).toBe(-15);
  });
});
