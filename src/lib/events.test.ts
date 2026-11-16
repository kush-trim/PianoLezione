import { describe, expect, it } from "vitest";
import { cancellingEvent, eventOn, occurrencesOn, remainingByClass, schoolOccurrences } from "./calendar";
import { toIcal } from "./ical-export";
import type { SlotDTO } from "./types";

const slot = (over: Partial<SlotDTO> = {}): SlotDTO => ({
  id: "s1",
  weekday: 2, // martedì
  startTime: "08:20",
  endTime: "09:50",
  subject: "Matematica",
  className: "3A",
  room: "12",
  color: "teal",
  validFrom: null,
  validTo: null,
  ...over,
});

// Settimana bianca da lunedì 16 a venerdì 20 febbraio 2026, per tutte le classi.
const bianca = {
  title: "Settimana bianca",
  date: "2026-02-16",
  endDate: "2026-02-20",
  startTime: null,
  endTime: null,
  className: "",
  cancelsLessons: true,
};

describe("eventi su più giorni", () => {
  it("un evento cade in ogni giorno del suo intervallo, estremi inclusi", () => {
    expect(eventOn(bianca, "2026-02-15")).toBe(false);
    expect(eventOn(bianca, "2026-02-16")).toBe(true);
    expect(eventOn(bianca, "2026-02-18")).toBe(true);
    expect(eventOn(bianca, "2026-02-20")).toBe(true);
    expect(eventOn(bianca, "2026-02-21")).toBe(false);
  });

  it("un evento di un giorno solo vale solo quel giorno", () => {
    const gita = { date: "2026-02-17", endDate: null };
    expect(eventOn(gita, "2026-02-17")).toBe(true);
    expect(eventOn(gita, "2026-02-18")).toBe(false);
  });

  it("la settimana bianca toglie le lezioni di tutta la settimana", () => {
    const slots = [slot(), slot({ id: "s2", weekday: 4, className: "2B" }), slot({ id: "s3", weekday: 5 })];
    const week = ["2026-02-16", "2026-02-17", "2026-02-18", "2026-02-19", "2026-02-20"];
    const during = week.flatMap((d) => schoolOccurrences(d, slots, [], new Set(), [bianca]));
    expect(during).toEqual([]);
    // La settimana dopo le lezioni ci sono di nuovo.
    const after = ["2026-02-24", "2026-02-26", "2026-02-27"].flatMap((d) => schoolOccurrences(d, slots, [], new Set(), [bianca]));
    expect(after).toHaveLength(3);
  });

  it("un evento di più giorni di una classe toglie solo le sue lezioni", () => {
    const campo = { ...bianca, title: "Campo scuola", className: "3A", endDate: "2026-02-18" };
    const tue = occurrencesOn("2026-02-17", [slot(), slot({ id: "s2", className: "2B" })], []);
    expect(tue.filter((o) => !cancellingEvent(o, [campo])).map((o) => o.slot.id)).toEqual(["s2"]);
  });

  it("un evento con orario su più giorni toglie solo le lezioni sovrapposte, ogni giorno", () => {
    const mattine = { ...bianca, startTime: "08:00", endTime: "10:00" };
    expect(schoolOccurrences("2026-02-17", [slot()], [], new Set(), [mattine])).toEqual([]);
    const pomeriggio = slot({ startTime: "13:30", endTime: "15:00" });
    expect(schoolOccurrences("2026-02-17", [pomeriggio], [], new Set(), [mattine])).toHaveLength(1);
  });

  it("le lezioni rimaste non contano la settimana bianca", () => {
    const year = { startDate: "2026-02-09", endDate: "2026-03-01" }; // 3 settimane, un martedì a settimana
    const { classes } = remainingByClass(year, "2026-02-09", [slot()], [], new Set(), [bianca], []);
    expect(classes[0].remaining).toBe(2);
  });
});

describe("calendario da abbonare", () => {
  it("un evento di giornata intera su più giorni diventa un solo evento con la fine esclusa", () => {
    const ics = toIcal("Prova", [{ uid: "e1@x", title: "Settimana bianca", date: "2026-02-16", lastDate: "2026-02-20", startTime: null, endTime: null }]);
    expect(ics).toContain("DTSTART;VALUE=DATE:20260216");
    expect(ics).toContain("DTEND;VALUE=DATE:20260221");
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(1);
  });
});
