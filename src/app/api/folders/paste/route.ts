import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { ApiError, readJson, route } from "@/lib/http";
import { clonePlan, getPlan } from "@/lib/plans";
import { pasteSchema } from "@/lib/validation";

type FolderRow = { id: string; parentId: string | null; name: string; color: string };

/** Il nome libero nella cartella di destinazione: "Nome", poi "Nome (copia)", "Nome (copia 2)"… */
function freeName(name: string, taken: Set<string>): string {
  if (!taken.has(name)) return name;
  for (let n = 1; ; n++) {
    const candidate = n === 1 ? `${name} (copia)` : `${name} (copia ${n})`;
    if (!taken.has(candidate)) return candidate;
  }
}

// POST /api/folders/paste → incolla in una cartella (null = fuori dalle cartelle).
// op "cut" sposta cartelle e piani; op "copy" li copia, le cartelle con tutto il loro contenuto.
// La risposta elenca cosa è stato creato o spostato (serve per Annulla) e, per ogni piano
// arrivato nella destinazione, da quale piano viene (serve per riportarlo nel nuovo anno).
export const POST = route(async (req) => {
  const user = await requireUser();
  const data = pasteSchema.parse(await readJson(req));
  const folders: FolderRow[] = await db.folder.findMany({
    where: { userId: user.id },
    select: { id: true, parentId: true, name: true, color: true },
  });
  const byId = new Map(folders.map((f) => [f.id, f]));
  const target = data.targetFolderId;
  if (target && !byId.has(target)) throw new ApiError(400, "Cartella di destinazione non valida");
  if (data.folderIds.some((id) => !byId.has(id))) throw new ApiError(400, "Cartella non valida");

  const ancestors = (id: string | null) => {
    const out: string[] = [];
    for (let cur = id; cur; cur = byId.get(cur)?.parentId ?? null) out.push(cur);
    return out;
  };
  // Una cartella dentro un'altra cartella selezionata viaggia già con lei.
  const selected = new Set(data.folderIds);
  const topFolders = data.folderIds.filter((id) => !ancestors(byId.get(id)!.parentId).some((a) => selected.has(a)));
  const subtree = (id: string): string[] => [id, ...folders.filter((f) => f.parentId === id).flatMap((f) => subtree(f.id))];
  const inSelected = new Set(topFolders.flatMap(subtree));

  const plans = await db.lessonPlan.findMany({
    where: { userId: user.id, id: { in: data.planIds } },
    select: { id: true, folderId: true, title: true },
  });
  if (plans.length !== new Set(data.planIds).size) throw new ApiError(400, "Piano non valido");
  const loosePlans = plans.filter((p) => !p.folderId || !inSelected.has(p.folderId));

  if (data.op === "cut") {
    const targetChain = new Set(ancestors(target));
    if (topFolders.some((id) => targetChain.has(id))) {
      throw new ApiError(400, "Non puoi spostare una cartella dentro sé stessa");
    }
    const movedFolders = topFolders.map((id) => ({ id, from: byId.get(id)!.parentId }));
    const movedPlans = loosePlans.map((p) => ({ id: p.id, from: p.folderId }));
    await db.$transaction([
      db.folder.updateMany({ where: { id: { in: topFolders }, userId: user.id }, data: { parentId: target } }),
      db.lessonPlan.updateMany({ where: { id: { in: loosePlans.map((p) => p.id) }, userId: user.id }, data: { folderId: target } }),
    ]);
    const nested = await db.lessonPlan.findMany({
      where: { userId: user.id, isTemplate: false, folderId: { in: [...inSelected] } },
      select: { id: true },
    });
    const arrived = [...loosePlans.map((p) => p.id), ...nested.map((p) => p.id)];
    return { op: "cut", movedFolders, movedPlans, planMap: arrived.map((id) => ({ planId: id, sourceId: id })) };
  }

  // --- Copia ---
  const createdFolders: string[] = [];
  const createdPlans: string[] = [];
  const planMap: { planId: string; sourceId: string }[] = [];
  const allPlans = await db.lessonPlan.findMany({
    where: { userId: user.id, folderId: { in: [...inSelected] } },
    select: { id: true, folderId: true },
  });
  // Nomi già presenti nella destinazione, per non creare doppioni con lo stesso nome.
  const siblingNames = new Set(folders.filter((f) => f.parentId === target).map((f) => f.name));
  const titlesIn = async (folderId: string | null) =>
    new Set((await db.lessonPlan.findMany({ where: { userId: user.id, folderId }, select: { title: true } })).map((p) => p.title));

  const copyPlan = async (id: string, folderId: string | null, taken?: Set<string>) => {
    const source = await getPlan(user.id, id);
    const title = source.title || "Senza titolo";
    const copy = await clonePlan(user.id, source, {
      title: taken ? freeName(title, taken) : source.title,
      isTemplate: source.isTemplate,
      folderId,
      keepTiming: true,
    });
    taken?.add(copy.title);
    createdPlans.push(copy.id);
    if (!source.isTemplate) planMap.push({ planId: copy.id, sourceId: id });
  };

  const copyFolder = async (id: string, parentId: string | null, name: string) => {
    const src = byId.get(id)!;
    const siblings = await db.folder.count({ where: { userId: user.id, parentId } });
    const created = await db.folder.create({
      data: { userId: user.id, parentId, name, color: src.color, order: siblings },
    });
    createdFolders.push(created.id);
    for (const p of allPlans.filter((p) => p.folderId === id)) await copyPlan(p.id, created.id);
    for (const child of folders.filter((f) => f.parentId === id)) await copyFolder(child.id, created.id, child.name);
  };

  for (const id of topFolders) {
    const name = freeName(byId.get(id)!.name, siblingNames);
    siblingNames.add(name);
    await copyFolder(id, target, name);
  }
  const taken = await titlesIn(target);
  for (const p of loosePlans) await copyPlan(p.id, target, taken);

  return { op: "copy", createdFolders, createdPlans, planMap };
});
