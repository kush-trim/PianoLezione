import { describe, expect, it } from "vitest";
import { MAX_TAGS, normalizeTags, parseTags, sortTags, tagClass } from "./tags";

describe("etichette degli esercizi", () => {
  it("pulisce spazi e doppioni, senza badare alle maiuscole", () => {
    expect(normalizeTags(["  verifica  ", "Verifica", "VERIFICA", "", "   "])).toEqual(["verifica"]);
    expect(normalizeTags(["per   la   1B"])).toEqual(["per la 1B"]);
  });

  it("le etichette pronte si scrivono sempre allo stesso modo", () => {
    expect(normalizeTags(["soluzioni", "EXTRA", "teoria"])).toEqual(["Soluzioni", "Extra", "Teoria"]);
  });

  it("taglia quelle troppo lunghe e ne tiene al massimo 12", () => {
    expect(normalizeTags(["x".repeat(50)])[0]).toHaveLength(30);
    expect(normalizeTags(Array.from({ length: 20 }, (_, i) => `t${i}`))).toHaveLength(MAX_TAGS);
  });

  it("legge il valore salvato; un valore rovinato vale come nessuna etichetta", () => {
    expect(parseTags('["Teoria","x"]')).toEqual(["Teoria", "x"]);
    expect(parseTags("non è json")).toEqual([]);
    expect(parseTags('{"a":1}')).toEqual([]);
    expect(parseTags('[1, "Extra", null]')).toEqual(["Extra"]);
    expect(parseTags(null)).toEqual([]);
  });

  it("prima le etichette pronte, poi le altre in ordine alfabetico", () => {
    expect(sortTags(["zeta", "Extra", "alfa", "Teoria"])).toEqual(["Teoria", "Extra", "alfa", "zeta"]);
  });

  it("colori: le pronte hanno il loro, le altre sono neutre", () => {
    expect(tagClass("soluzioni")).toContain("warn");
    expect(tagClass("verifica")).toBe("bg-sunken text-ink");
  });
});
