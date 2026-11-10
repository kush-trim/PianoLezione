import { describe, expect, it } from "vitest";
import { parseSchoolCalendar, ticinoCalendarUrl, yearFolderName } from "./school-calendar";

// Testo come esce dal PDF ufficiale 2026/2027 del Cantone Ticino.
const TICINO_2026 = `Repubblica e Cantone del Ticino
Dipartimento dell'educazione, della cultura e dello sport
In tutte le scuole le lezioni cominciano lunedì 31 agosto 2026 (eccezioni vedi osservazione 1)
(dal – al compresi)
Le vacanze scolastiche sono così stabilite:
 vacanze autunnali: dal 31 ottobre all’ 8 novembre 2026
 vacanze di Natale: dal 24 dicembre 2026 al 6 gennaio 2027
 vacanze di Carnevale: dal 6 febbraio al 14 febbraio 2027
 vacanze di Pasqua: dal 26 marzo al 4 aprile 2027
 Martedì 8 dicembre 2026: Immacolata
 Venerdì 19 marzo 2027: San Giuseppe
 Giovedì 6 maggio 2027: Festa dell’Ascensione
 Lunedì 17 maggio 2027: Lunedì di Pentecoste
 Giovedì 27 maggio 2027: Corpus Domini
È inoltre giorno di vacanza venerdì 7 maggio 2027.
In tutte le scuole le lezioni terminano mercoledì 16 giugno 2027 (eccezioni vedi osservazione 1)
2 Gli esami finali delle scuole postobbligatorie avranno luogo, di regola, a partire dal 17 giugno 2027.`;

describe("calendario scolastico da PDF", () => {
  const r = parseSchoolCalendar(TICINO_2026);

  it("legge inizio e fine delle lezioni", () => {
    expect(r.year).toEqual({ name: "2026/27", startDate: "2026-08-31", endDate: "2027-06-16" });
  });

  it("legge i periodi di vacanza, anche a cavallo dell'anno", () => {
    expect(r.holidays.slice(0, 2)).toEqual([
      { name: "Vacanze autunnali", startDate: "2026-10-31", endDate: "2026-11-08" },
      { name: "Immacolata", startDate: "2026-12-08", endDate: "2026-12-08" },
    ]);
    expect(r.holidays).toContainEqual({ name: "Vacanze di Natale", startDate: "2026-12-24", endDate: "2027-01-06" });
    expect(r.holidays).toContainEqual({ name: "Vacanze di Carnevale", startDate: "2027-02-06", endDate: "2027-02-14" });
    expect(r.holidays).toContainEqual({ name: "Vacanze di Pasqua", startDate: "2027-03-26", endDate: "2027-04-04" });
  });

  it("legge i giorni festivi singoli e i giorni di vacanza aggiunti", () => {
    expect(r.holidays).toContainEqual({ name: "Festa dell'Ascensione", startDate: "2027-05-06", endDate: "2027-05-06" });
    expect(r.holidays).toContainEqual({ name: "Lunedì di Pentecoste", startDate: "2027-05-17", endDate: "2027-05-17" });
    expect(r.holidays).toContainEqual({ name: "Giorno di vacanza", startDate: "2027-05-07", endDate: "2027-05-07" });
    expect(r.holidays).toHaveLength(10);
  });

  it("non segnala come dubbie le righe sugli esami", () => {
    expect(r.warnings).toEqual([]);
  });

  it("ignora i punti elenco dei PDF (carattere simbolo U+F0B7)", () => {
    const x = parseSchoolCalendar("\uf0b7 vacanze autunnali: dal 31 ottobre all’ 8 novembre 2026\n\uf0b7 Martedì 8 dicembre 2026: Immacolata");
    expect(x.holidays).toEqual([
      { name: "Vacanze autunnali", startDate: "2026-10-31", endDate: "2026-11-08" },
      { name: "Immacolata", startDate: "2026-12-08", endDate: "2026-12-08" },
    ]);
    expect(x.warnings).toEqual([]);
  });

  it("segnala le righe con date che non capisce", () => {
    const x = parseSchoolCalendar("Giornata cantonale: forse il 3 marzo 2027 o dopo");
    expect(x.holidays).toEqual([]);
    expect(x.warnings).toHaveLength(1);
    expect(x.year).toBeNull();
  });
});

describe("nomi e indirizzi", () => {
  it("costruisce l'indirizzo del PDF ufficiale", () => {
    expect(ticinoCalendarUrl(2027)).toMatch(/Calendario_scolastico_2027_2028\.pdf$/);
  });
  it("dà il nome alla cartella dell'anno", () => {
    expect(yearFolderName({ startDate: "2027-08-30", endDate: "2028-06-14" })).toBe("Anno 2027/2028");
  });
});
