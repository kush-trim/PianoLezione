import { describe, expect, it } from "vitest";
import { defaultSchoolYear, occurrencesOn, slotValidOn, yearFor, yearWeeks } from "./calendar";
import { decrypt, decryptJson, encrypt, encryptJson } from "./crypto";
import { expandEvents, parseIcal } from "./ical";
import { objectivesText } from "./plan-utils";
import type { ExceptionDTO, SlotDTO } from "./types";

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

describe("lezioni ricorrenti", () => {
  it("vale solo nel suo giorno della settimana", () => {
    expect(slotValidOn(slot(), "2026-11-17")).toBe(true); // martedì
    expect(slotValidOn(slot(), "2026-11-18")).toBe(false);
  });

  it("rispetta il periodo di validità, estremi inclusi", () => {
    const s = slot({ validFrom: "2026-11-17", validTo: "2026-12-01" });
    expect(slotValidOn(s, "2026-11-10")).toBe(false);
    expect(slotValidOn(s, "2026-11-17")).toBe(true);
    expect(slotValidOn(s, "2026-12-01")).toBe(true);
    expect(slotValidOn(s, "2026-12-08")).toBe(false);
  });

  it("applica la modifica solo al giorno indicato", () => {
    const ex: ExceptionDTO = {
      id: "e1", slotId: "s1", date: "2026-11-17", kind: "modificata",
      startTime: "10:00", endTime: "11:30", room: null, note: "aula occupata",
    };
    const [moved] = occurrencesOn("2026-11-17", [slot()], [ex]);
    expect([moved.startTime, moved.endTime, moved.room, moved.modified]).toEqual(["10:00", "11:30", "12", true]);
    const [normal] = occurrencesOn("2026-11-24", [slot()], [ex]);
    expect([normal.startTime, normal.modified]).toEqual(["08:20", false]);
  });

  it("segna la lezione annullata senza toglierla", () => {
    const ex: ExceptionDTO = {
      id: "e1", slotId: "s1", date: "2026-11-17", kind: "annullata",
      startTime: null, endTime: null, room: null, note: "",
    };
    const [o] = occurrencesOn("2026-11-17", [slot()], [ex]);
    expect(o.cancelled).toBe(true);
    expect(o.startTime).toBe("08:20");
  });
});

describe("anno scolastico", () => {
  const year = { startDate: "2026-08-31", endDate: "2026-11-13" };
  const autunno = { name: "Vacanze autunnali", startDate: "2026-10-24", endDate: "2026-11-01" };

  it("numera le settimane saltando quelle tutte di vacanza", () => {
    const weeks = yearWeeks(year, [autunno]);
    expect(weeks[0]).toEqual({ monday: "2026-08-31", number: 1, holiday: null });
    const vacanza = weeks.find((w) => w.monday === "2026-10-26")!;
    expect(vacanza).toEqual({ monday: "2026-10-26", number: null, holiday: "Vacanze autunnali" });
    const prima = weeks.find((w) => w.monday === "2026-10-19")!;
    const dopo = weeks.find((w) => w.monday === "2026-11-02")!;
    expect(dopo.number).toBe(prima.number! + 1);
  });

  it("una settimana con un solo giorno di vacanza resta numerata", () => {
    const weeks = yearWeeks(year, [{ name: "Festa", startDate: "2026-09-10", endDate: "2026-09-10" }]);
    expect(weeks.find((w) => w.monday === "2026-09-07")!.number).toBe(2);
  });

  it("sceglie l'anno che contiene la data, altrimenti il prossimo", () => {
    const a = { startDate: "2025-09-01", endDate: "2026-06-20" };
    const b = { startDate: "2026-09-01", endDate: "2027-06-20" };
    expect(yearFor([a, b], "2026-11-10")).toBe(b);
    expect(yearFor([a, b], "2026-07-15")).toBe(b);
    expect(yearFor([a], "2026-11-10")).toBe(a);
    expect(yearFor([], "2026-11-10")).toBeNull();
  });

  it("propone l'anno in corso", () => {
    expect(defaultSchoolYear("2026-11-10")).toEqual({ name: "2026/27", startDate: "2026-09-01", endDate: "2027-06-20" });
    expect(defaultSchoolYear("2027-03-02").name).toBe("2026/27");
  });
});

describe("obiettivi strutturati", () => {
  it("compone le frasi con il soggetto giusto", () => {
    expect(
      objectivesText("insegnamento", [
        { id: "1", verbo: "presenta", testo: "il concetto di area" },
        { id: "2", verbo: "", testo: "" },
      ]),
    ).toBe("- Il docente presenta il concetto di area");
    expect(objectivesText("apprendimento", [{ id: "1", verbo: "misura", testo: "l’area del banco" }])).toBe(
      "- L’allievo misura l’area del banco",
    );
  });
});

describe("calendario iCal", () => {
  const ics = [
    "BEGIN:VCALENDAR",
    "BEGIN:VEVENT",
    "SUMMARY:Vacanze di Natale",
    "DTSTART;VALUE=DATE:20261224",
    "DTEND;VALUE=DATE:20270107",
    "END:VEVENT",
    "BEGIN:VEVENT",
    "SUMMARY:Collegio docenti\\, aula magna",
    "DTSTART:20261118T153000Z",
    "DTEND:20261118T170000Z",
    "END:VEVENT",
    "BEGIN:VEVENT",
    "SUMMARY:Riunione di materia con un titolo molto lungo che va a ca",
    " po",
    "DTSTART;TZID=Europe/Zurich:20261102T160000",
    "DTEND;TZID=Europe/Zurich:20261102T170000",
    "RRULE:FREQ=WEEKLY;COUNT=3",
    "EXDATE;TZID=Europe/Zurich:20261109T160000",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
  const events = parseIcal(ics);

  it("legge gli eventi di più giorni (fine esclusa)", () => {
    const natale = events.find((e) => e.title === "Vacanze di Natale")!;
    expect([natale.startDate, natale.endDate, natale.startTime]).toEqual(["2026-12-24", "2027-01-06", null]);
    const giorni = expandEvents([natale], "2026-12-28", "2027-01-03");
    expect(giorni).toHaveLength(7);
  });

  it("converte gli orari UTC nell'ora locale", () => {
    const collegio = events.find((e) => e.title.startsWith("Collegio"))!;
    expect(collegio.title).toBe("Collegio docenti, aula magna");
    expect([collegio.startDate, collegio.startTime, collegio.endTime]).toEqual(["2026-11-18", "16:30", "18:00"]);
  });

  it("espande le ricorrenze settimanali rispettando COUNT ed EXDATE", () => {
    const riunione = events.find((e) => e.title.startsWith("Riunione"))!;
    expect(riunione.title.endsWith("a capo")).toBe(true); // righe spezzate ricomposte
    const occ = expandEvents([riunione], "2026-11-01", "2026-12-31").map((o) => o.date);
    expect(occ).toEqual(["2026-11-02", "2026-11-16"]);
  });
});

describe("cifratura", () => {
  it("cifra e decifra", () => {
    const enc = encrypt("sk-segreta");
    expect(enc).not.toContain("sk-segreta");
    expect(decrypt(enc)).toBe("sk-segreta");
    expect(encrypt("sk-segreta")).not.toBe(enc); // IV diverso ogni volta
  });

  it("rifiuta un testo manomesso", () => {
    const enc = encrypt("sk-segreta");
    expect(decrypt(enc.slice(0, -3) + "AAA")).toBeNull();
    expect(decrypt("")).toBeNull();
    expect(decryptJson("non-valido", { vuoto: true })).toEqual({ vuoto: true });
    expect(decryptJson(encryptJson({ a: 1 }), {})).toEqual({ a: 1 });
  });
});
