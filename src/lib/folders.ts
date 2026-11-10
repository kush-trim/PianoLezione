import type { FolderDTO } from "./types";

export type FolderNode = FolderDTO & { depth: number; children: FolderNode[] };

/** Albero delle cartelle a partire dall'elenco piatto. */
export function buildTree(folders: FolderDTO[]): FolderNode[] {
  const byParent = new Map<string | null, FolderDTO[]>();
  const ids = new Set(folders.map((f) => f.id));
  for (const f of folders) {
    // Una cartella il cui genitore non esiste più viene mostrata in radice.
    const key = f.parentId && ids.has(f.parentId) ? f.parentId : null;
    byParent.set(key, [...(byParent.get(key) ?? []), f]);
  }
  const build = (parentId: string | null, depth: number): FolderNode[] =>
    (byParent.get(parentId) ?? []).map((f) => ({ ...f, depth, children: build(f.id, depth + 1) }));
  return build(null, 0);
}

/** L'albero appiattito in ordine di visita, utile per i menu a tendina. */
export function flattenTree(nodes: FolderNode[]): FolderNode[] {
  return nodes.flatMap((n) => [n, ...flattenTree(n.children)]);
}

export function descendantIds(node: FolderNode): string[] {
  return node.children.flatMap((c) => [c.id, ...descendantIds(c)]);
}
