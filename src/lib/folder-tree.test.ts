import { describe, expect, it } from "vitest";
import { childrenOf, flattenTree, folderLabel, folderTotals, pathOf, subtreeIds } from "./folder-tree";

const f = (id: string, parentId: string | null, fileCount = 0, bytes = 0, lastFileAt: string | null = null) => ({
  id,
  name: id,
  parentId,
  fileCount,
  bytes,
  lastFileAt,
});

// prima media
// ├── frazioni
// │   ├── verifiche
// │   └── schede 10
// └── geometria
// seconda media
const folders = [
  f("prima media", null, 2, 100, "2026-10-01T10:00:00Z"),
  f("frazioni", "prima media", 3, 300, "2026-11-01T10:00:00Z"),
  f("verifiche", "frazioni", 1, 50, "2026-11-10T10:00:00Z"),
  f("schede 10", "frazioni"),
  f("schede 9", "frazioni"),
  f("geometria", "prima media", 1, 10),
  f("seconda media", null, 5, 999, "2026-12-01T10:00:00Z"),
];

describe("albero delle cartelle di esercizi", () => {
  it("sottocartelle dirette in ordine di nome (i numeri in ordine naturale)", () => {
    expect(childrenOf(folders, "prima media").map((x) => x.id)).toEqual(["frazioni", "geometria"]);
    expect(childrenOf(folders, "frazioni").map((x) => x.id)).toEqual(["schede 9", "schede 10", "verifiche"]);
    expect(childrenOf(folders, "geometria")).toEqual([]);
  });

  it("percorso e nome completo", () => {
    expect(pathOf(folders, "verifiche").map((x) => x.id)).toEqual(["prima media", "frazioni", "verifiche"]);
    expect(folderLabel(folders, "verifiche")).toBe("prima media / frazioni / verifiche");
    expect(folderLabel(folders, "seconda media")).toBe("seconda media");
    expect(pathOf(folders, "non esiste")).toEqual([]);
  });

  it("un ciclo nei dati non blocca il percorso", () => {
    const loop = [f("a", "b"), f("b", "a")];
    expect(pathOf(loop, "a").length).toBe(2);
  });

  it("la cartella con tutto ciò che contiene", () => {
    expect([...subtreeIds(folders, "frazioni")].sort()).toEqual(["frazioni", "schede 10", "schede 9", "verifiche"]);
    expect([...subtreeIds(folders, "geometria")]).toEqual(["geometria"]);
  });

  it("totali con le sottocartelle", () => {
    expect(folderTotals(folders, "prima media")).toEqual({ files: 7, bytes: 460, subfolders: 5, lastFileAt: "2026-11-10T10:00:00Z" });
    expect(folderTotals(folders, "geometria")).toEqual({ files: 1, bytes: 10, subfolders: 0, lastFileAt: null });
  });

  it("elenco in profondità con il rientro", () => {
    const roots = folders.filter((x) => !x.parentId);
    expect(flattenTree(folders, roots).map((x) => `${"-".repeat(x.depth)}${x.folder.id}`)).toEqual([
      "prima media",
      "-frazioni",
      "--schede 9",
      "--schede 10",
      "--verifiche",
      "-geometria",
      "seconda media",
    ]);
  });
});
