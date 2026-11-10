import { describe, expect, it } from "vitest";
import { yearWeeks } from "./calendar";
import type { SlotDTO } from "./types";
import { classFromFolders, proposeLessons, weeksWithLessons, type SourceInfo } from "./year-proposal";

const slot = (over: Partial<SlotDTO>): SlotDTO => ({
  id: "s",
  weekday: 1,
  startTime: "08:00",
  endTime: "08:45",
  subject: "Matematica",
  className: "3A",
  room: "",
  color: "teal",
  validFrom: null,
  validTo: null,
  ...over,
});

// Nuovo anno: 3A matematica lunedì (doppia 8:00–9:35) e giovedì, 2B matematica martedì.
const slots = [
  slot({ id: "lun1" }),
  slot({ id: "lun2", startTime: "08:50", endTime: "09:35" }),
  slot({ id: "gio", weekday: 4, startTime: "10:00", endTime: "10:45" }),
  slot({ id: "mar", weekday: 2, className: "2B" }),
];
const year = { startDate: "2027-08-30", endDate: "2027-10-01" };
const holidays = new Set(["2027-09-06", "2027-09-07", "2027-09-08", "2027-09-09", "2027-09-10"]); // settimana 2 di vacanza
const weeks = weeksWithLessons(year, yearWeeks(year, [{ name: "Vacanza", startDate: "2027-09-06", endDate: "2027-09-10" }]), slots, [], holidays, [], new Set());

const source = (over: Partial<SourceInfo>): SourceInfo => ({
  planId: "p",
  title: "",
  date: "2026-09-07",
  week: 1,
  subject: "Matematica",
  className: "3A",
  index: 0,
  classHint: null,
  ...over,
});

describe("settimane del nuovo anno", () => {
  it("salta le settimane di vacanza e unisce le ore consecutive", () => {
    expect(weeks.map((w) => w.number)).toEqual([1, 2, 3, 4]);
    expect(weeks[1].monday).toBe("2027-09-13");
    const monday = weeks[0].lessons.find((l) => l.date === "2027-08-30" && l.className === "3A");
    expect(monday?.slotIds).toEqual(["lun1", "lun2"]);
    expect(monday?.endTime).toBe("09:35");
  });
});

describe("proposta della settimana", () => {
  it("stessa settimana e stessa posizione dell'anno prima", () => {
    const [a, b] = proposeLessons([source({ planId: "a" }), source({ planId: "b", date: "2026-09-10", index: 1 })], weeks);
    expect(a).toEqual({ planId: "a", monday: "2027-08-30", date: "2027-08-30", slotIds: ["lun1", "lun2"] });
    expect(b.date).toBe("2027-09-02");
    expect(b.slotIds).toEqual(["gio"]);
  });

  it("due piani non finiscono sulla stessa lezione", () => {
    const [a, b] = proposeLessons([source({ planId: "a" }), source({ planId: "b" })], weeks);
    expect(a.slotIds).toEqual(["lun1", "lun2"]);
    expect(b.slotIds).toEqual(["gio"]);
  });

  it("la cartella della classe vince sulla classe dell'anno prima", () => {
    const [a] = proposeLessons([source({ className: "1C", classHint: "2B" })], weeks);
    expect(a.slotIds).toEqual(["mar"]);
  });

  it("senza lezioni adatte propone solo il giorno; senza data non propone nulla", () => {
    const [a, b] = proposeLessons(
      [source({ planId: "a", subject: "Storia", className: "4D", date: "2026-09-09", week: 3 }), source({ planId: "b", date: null, week: null })],
      weeks,
    );
    expect(a).toEqual({ planId: "a", monday: "2027-09-20", date: "2027-09-22", slotIds: [] });
    expect(b).toEqual({ planId: "b", monday: null, date: null, slotIds: [] });
  });

  it("riconosce la classe dal nome di una cartella", () => {
    expect(classFromFolders(["Anno 2027/2028", "3a"].reverse(), ["3A", "2B"])).toBe("3A");
    expect(classFromFolders(["Geometria"], ["3A"])).toBeNull();
  });
});
