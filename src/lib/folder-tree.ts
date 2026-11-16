// L'albero delle cartelle di esercizi, ricostruito dall'elenco piatto che manda il server.
// Funzioni pure: servono alla pagina Esercizi e alla scelta della cartella in un piano.

type TreeFolder = {
  id: string;
  name: string;
  parentId: string | null;
  fileCount: number;
  bytes: number;
  lastFileAt: string | null;
};

const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, "it", { numeric: true });

/** Le sottocartelle dirette, in ordine di nome. */
export function childrenOf<T extends TreeFolder>(folders: T[], parentId: string): T[] {
  return folders.filter((f) => f.parentId === parentId).sort(byName);
}

/** Dalla cartella principale fino a quella indicata (compresa). */
export function pathOf<T extends TreeFolder>(folders: T[], id: string): T[] {
  const byId = new Map(folders.map((f) => [f.id, f]));
  const out: T[] = [];
  const seen = new Set<string>();
  for (let f = byId.get(id); f && !seen.has(f.id); f = f.parentId ? byId.get(f.parentId) : undefined) {
    seen.add(f.id);
    out.unshift(f);
  }
  return out;
}

/** "Principale / Sotto / Sotto": il nome completo, per gli elenchi a tendina. */
export const folderLabel = (folders: TreeFolder[], id: string) =>
  pathOf(folders, id)
    .map((f) => f.name)
    .join(" / ");

/** La cartella e tutte quelle che contiene, a qualsiasi profondità. */
export function subtreeIds(folders: TreeFolder[], id: string): Set<string> {
  const ids = new Set([id]);
  for (let grew = true; grew; ) {
    grew = false;
    for (const f of folders) {
      if (f.parentId && ids.has(f.parentId) && !ids.has(f.id)) {
        ids.add(f.id);
        grew = true;
      }
    }
  }
  return ids;
}

/** Totali di una cartella con tutte le sottocartelle. */
export function folderTotals(folders: TreeFolder[], id: string) {
  const ids = subtreeIds(folders, id);
  let files = 0;
  let bytes = 0;
  let lastFileAt: string | null = null;
  for (const f of folders) {
    if (!ids.has(f.id)) continue;
    files += f.fileCount;
    bytes += f.bytes;
    if (f.lastFileAt && (!lastFileAt || f.lastFileAt > lastFileAt)) lastFileAt = f.lastFileAt;
  }
  return { files, bytes, subfolders: ids.size - 1, lastFileAt };
}

/** Elenco in profondità (per menu e albero), con il livello di rientro. */
export function flattenTree<T extends TreeFolder>(folders: T[], roots: T[]): { folder: T; depth: number }[] {
  const out: { folder: T; depth: number }[] = [];
  const walk = (f: T, depth: number) => {
    out.push({ folder: f, depth });
    for (const c of childrenOf(folders, f.id)) walk(c, depth + 1);
  };
  for (const r of roots) walk(r, 0);
  return out;
}
