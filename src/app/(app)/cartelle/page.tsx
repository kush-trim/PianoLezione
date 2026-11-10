"use client";

import {
  ArrowUpRight,
  CalendarRange,
  ChevronRight,
  ClipboardPaste,
  Copy,
  CopyPlus,
  FileText,
  Folder,
  FolderPlus,
  Inbox,
  Layers,
  Pencil,
  Plus,
  Scissors,
  Search,
  Trash2,
  Wand2,
  X,
} from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent, type FormEvent, type MouseEvent } from "react";
import {
  Button,
  ColorPicker,
  cx,
  Dialog,
  EmptyState,
  ErrorNote,
  Field,
  IconButton,
  Input,
  inputClass,
  isMod,
  isTyping,
  Loading,
  modLabel,
  PageHeader,
  useToast,
} from "@/components/ui";
import { YearProposalDialog } from "@/components/YearProposalDialog";
import { api, errorMessage } from "@/lib/api";
import { swatch } from "@/lib/colors";
import { buildTree, descendantIds, flattenTree, type FolderNode } from "@/lib/folders";
import { humanDate } from "@/lib/plan-utils";
import type { FolderDTO, PlanDTO, PlanSummary, ProposalDTO } from "@/lib/types";

// "all" = tutti i piani, "none" = senza cartella, altrimenti l'id della cartella.
type Selection = "all" | "none" | string;
type FolderDraft = { id?: string; name: string; color: string; parentId: string | null };
type Picked = { folders: Set<string>; plans: Set<string> };
type Clipboard = { op: "copy" | "cut"; folderIds: string[]; planIds: string[] };
type PasteResult =
  | { op: "copy"; createdFolders: string[]; createdPlans: string[]; planMap: { planId: string; sourceId: string }[] }
  | {
      op: "cut";
      movedFolders: { id: string; from: string | null }[];
      movedPlans: { id: string; from: string | null }[];
      planMap: { planId: string; sourceId: string }[];
    };
type Undo = { label: string; run: () => Promise<unknown> };

const DRAG_TYPE = "application/x-pianostudio-items";
const empty = (): Picked => ({ folders: new Set(), plans: new Set() });

// Gli appunti restano finché la pagina dell'app è aperta, anche passando da una cartella all'altra.
const clipboardStore: { current: Clipboard | null } = { current: null };
function storeClipboard(c: Clipboard | null) {
  clipboardStore.current = c;
}

/** Il corpo per ricreare un piano eliminato (Annulla). */
function restoreBody(p: PlanDTO) {
  return {
    title: p.title,
    isTemplate: p.isTemplate,
    folderId: p.folderId,
    date: p.date,
    manualStart: p.manualStart,
    manualDuration: p.manualDuration,
    prerequisiti: p.prerequisiti,
    obiettivoInsegnamento: p.obiettivoInsegnamento,
    traguardo: p.traguardo,
    obiettivoApprendimento: p.obiettivoApprendimento,
    obiettiviInsegnamento: p.obiettiviInsegnamento,
    obiettiviApprendimento: p.obiettiviApprendimento,
    verifica: p.verifica,
    allegati: p.allegati,
    allegatiAuto: p.allegatiAuto,
    sezioniExtra: p.sezioniExtra,
    notaPost: p.notaPost,
    slotIds: p.slotIds,
    phases: p.phases,
    exerciseIds: p.exercises.map((e) => e.id),
  };
}

const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
function describe(folders: number, plans: number) {
  return [folders && count(folders, "cartella", "cartelle"), plans && count(plans, "piano", "piani")].filter(Boolean).join(" e ");
}

export default function CartellePage() {
  const router = useRouter();
  const params = useSearchParams();
  const toast = useToast();
  const [folders, setFolders] = useState<FolderDTO[] | null>(null);
  const [plans, setPlans] = useState<PlanSummary[] | null>(null);
  const [templates, setTemplates] = useState<PlanSummary[]>([]);
  const [selected, setSelected] = useState<Selection>(() => params.get("folder") ?? "all");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState<FolderDraft | null>(null);
  const [draftError, setDraftError] = useState("");
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const [picked, setPicked] = useState<Picked>(empty);
  const [clipboard, setClipboardState] = useState<Clipboard | null>(clipboardStore.current);
  const [proposal, setProposal] = useState<ProposalDTO | null>(null);
  const undoStack = useRef<Undo[]>([]);
  const anchor = useRef<number | null>(null);

  const setClipboard = (c: Clipboard | null) => {
    storeClipboard(c);
    setClipboardState(c);
  };

  const load = useCallback(
    () =>
      Promise.all([
        api.get<FolderDTO[]>("/api/folders"),
        api.get<PlanSummary[]>("/api/plans"),
        api.get<PlanSummary[]>("/api/plans?templates=1"),
      ]).then(
        ([f, p, t]) => {
          setFolders(f);
          setPlans(p);
          setTemplates(t);
        },
        (e) => toast(errorMessage(e), "error"),
      ),
    [toast],
  );
  useEffect(() => {
    load();
  }, [load]);

  // La ricerca rapida (⌘K) apre una cartella con ?folder=…, anche se la pagina è già aperta.
  const folderParam = params.get("folder");
  const [seenParam, setSeenParam] = useState(folderParam);
  if (folderParam !== seenParam) {
    setSeenParam(folderParam);
    if (folderParam) setSelected(folderParam);
  }

  const tree = useMemo(() => buildTree(folders ?? []), [folders]);
  const flat = useMemo(() => flattenTree(tree), [tree]);
  const current = flat.find((f) => f.id === selected);

  // Se la cartella selezionata è stata eliminata si torna a "Tutti i piani".
  const selection: Selection = selected === "all" || selected === "none" || current ? selected : "all";
  const q = query.trim().toLowerCase();
  const subfolders = selection !== "all" && selection !== "none" && !q ? (current?.children ?? []) : [];
  const visible = (plans ?? []).filter((p) => {
    if (q && !p.title.toLowerCase().includes(q)) return false;
    if (selection === "all") return true;
    if (selection === "none") return p.folderId === null;
    return p.folderId === selection;
  });
  // Elenco della colonna di destra: prima le sottocartelle, poi i piani.
  const items: { kind: "folder" | "plan"; id: string }[] = [
    ...subfolders.map((f) => ({ kind: "folder" as const, id: f.id })),
    ...visible.map((p) => ({ kind: "plan" as const, id: p.id })),
  ];
  const pickedCount = picked.folders.size + picked.plans.size;
  const isPicked = (kind: "folder" | "plan", id: string) => (kind === "folder" ? picked.folders : picked.plans).has(id);
  const folderName = (id: string | null) => (id ? (flat.find((f) => f.id === id)?.name ?? "cartella") : "Senza cartella");

  /** Dove si incolla: la cartella aperta. Se negli appunti c'è proprio lei, accanto a lei. */
  const pasteTarget = (clip: Clipboard | null): string | null => {
    const target = current ? current.id : null;
    if (target && clip?.folderIds.includes(target)) return current!.parentId;
    return target;
  };

  // --- Selezione ---

  function pick(e: MouseEvent, index: number) {
    const item = items[index];
    if (e.shiftKey && anchor.current !== null) {
      const [a, b] = [Math.min(anchor.current, index), Math.max(anchor.current, index)];
      const next = isMod(e) ? { folders: new Set(picked.folders), plans: new Set(picked.plans) } : empty();
      for (const it of items.slice(a, b + 1)) (it.kind === "folder" ? next.folders : next.plans).add(it.id);
      setPicked(next);
      return;
    }
    anchor.current = index;
    if (isMod(e)) {
      const next = { folders: new Set(picked.folders), plans: new Set(picked.plans) };
      const set = item.kind === "folder" ? next.folders : next.plans;
      if (set.has(item.id)) set.delete(item.id);
      else set.add(item.id);
      setPicked(next);
    } else {
      setPicked(item.kind === "folder" ? { folders: new Set([item.id]), plans: new Set() } : { folders: new Set(), plans: new Set([item.id]) });
    }
  }

  function openFolder(id: Selection) {
    setSelected(id);
    setPicked(empty());
    anchor.current = null;
  }

  /** Cosa copiare o tagliare: la selezione o, se è vuota, la cartella aperta. */
  function currentItems(): Omit<Clipboard, "op"> {
    if (pickedCount) return { folderIds: [...picked.folders], planIds: [...picked.plans] };
    if (current) return { folderIds: [current.id], planIds: [] };
    return { folderIds: [], planIds: [] };
  }

  // --- Operazioni ---

  function pushUndo(u: Undo): Undo {
    undoStack.current = [...undoStack.current.slice(-19), u];
    return u;
  }

  /** Il pulsante "Annulla" di un messaggio annulla solo la sua operazione, se è ancora l'ultima. */
  const undoAction = (u: Undo) => ({
    label: "Annulla",
    run: () => (undoStack.current.at(-1) === u ? undo() : toast("Questa operazione non è più l'ultima: usa " + modLabel() + "Z")),
  });

  async function undo() {
    const u = undoStack.current.pop();
    if (!u) return toast("Niente da annullare");
    try {
      await u.run();
      await load();
      toast(`Annullato: ${u.label}`);
    } catch (e) {
      toast(errorMessage(e), "error");
    }
  }

  function copyOrCut(op: Clipboard["op"]) {
    const it = currentItems();
    if (!it.folderIds.length && !it.planIds.length) return toast("Seleziona prima una cartella o un piano");
    setClipboard({ op, ...it });
    toast(`${op === "copy" ? "Copiato" : "Tagliato"}: ${describe(it.folderIds.length, it.planIds.length)}. Incolla con ${modLabel()}V`);
  }

  /** Copia o sposta in una cartella; poi, se è la cartella di un anno, propone le settimane. */
  async function paste(clip: Clipboard, target: string | null) {
    try {
      const res = await api.post<PasteResult>("/api/folders/paste", { ...clip, targetFolderId: target });
      const what = describe(clip.folderIds.length, clip.planIds.length);
      const where = target ? `"${folderName(target)}"` : "Senza cartella";
      let u: Undo;
      if (res.op === "copy") {
        u = {
          label: `copia di ${what}`,
          run: async () => {
            if (res.createdPlans.length) await api.post("/api/plans/bulk-delete", { ids: res.createdPlans });
            for (const id of res.createdFolders) await api.del(`/api/folders/${id}`).catch(() => {});
          },
        };
      } else {
        setClipboard(null);
        u = {
          label: `spostamento di ${what}`,
          run: async () => {
            for (const f of res.movedFolders) await api.patch(`/api/folders/${f.id}`, { parentId: f.from });
            for (const p of res.movedPlans) await api.put(`/api/plans/${p.id}`, { folderId: p.from });
          },
        };
      }
      pushUndo(u);
      await load();
      setPicked(empty());
      toast(`${res.op === "copy" ? "Copiato" : "Spostato"} in ${where}: ${what}`, "ok", undoAction(u));

      if (target && res.planMap.length) {
        const prop = await api.post<ProposalDTO | null>("/api/year/propose", { targetFolderId: target, plans: res.planMap });
        if (prop?.plans.length) setProposal(prop);
      }
    } catch (e) {
      toast(errorMessage(e), "error");
    }
  }

  async function duplicateHere() {
    const it = currentItems();
    if (!it.folderIds.length && !it.planIds.length) return;
    // Si duplica accanto all'originale: nella cartella che lo contiene.
    const parent = it.folderIds.length
      ? (flat.find((f) => f.id === it.folderIds[0])?.parentId ?? null)
      : (plans!.find((p) => p.id === it.planIds[0])?.folderId ?? null);
    await paste({ op: "copy", ...it }, parent);
  }

  const removePicked = () => removeItems(currentItems());

  async function removeItems(it: Omit<Clipboard, "op">) {
    if (!it.folderIds.length && !it.planIds.length) return;
    const fNames = it.folderIds.map((id) => `"${folderName(id)}"`);
    const msg =
      `Eliminare ${describe(it.folderIds.length, it.planIds.length)}?` +
      (it.folderIds.length
        ? `\n\nCartelle: ${fNames.join(", ")} con le loro sottocartelle. I piani dentro non vengono eliminati: restano senza cartella. L'eliminazione delle cartelle non si può annullare.`
        : "");
    if (!confirm(msg)) return;
    try {
      // I piani si possono ripristinare con Annulla: prima se ne tiene una copia completa.
      const full = await Promise.all(it.planIds.map((id) => api.get<PlanDTO>(`/api/plans/${id}`)));
      if (it.planIds.length) await api.post("/api/plans/bulk-delete", { ids: it.planIds });
      for (const id of it.folderIds) await api.del(`/api/folders/${id}`);
      const u = full.length
        ? pushUndo({
          label: `eliminazione di ${count(full.length, "piano", "piani")}`,
            run: async () => {
              for (const p of full) await api.post("/api/plans/restore", restoreBody(p));
            },
          })
        : null;
      if (it.folderIds.includes(selected)) setSelected("all");
      setPicked(empty());
      await load();
      toast(
        `Eliminato: ${describe(it.folderIds.length, it.planIds.length)}`,
        "ok",
        u ? undoAction(u) : undefined,
      );
    } catch (e) {
      toast(errorMessage(e), "error");
    }
  }

  function openPicked() {
    if (pickedCount !== 1) return;
    if (picked.folders.size) openFolder([...picked.folders][0]);
    else router.push(`/piani/${[...picked.plans][0]}`);
  }

  // --- Tastiera: ⌘/Ctrl + C, X, V, D, A, Z; Canc; Invio; frecce; Esc ---
  const keyRef = useRef<(e: KeyboardEvent) => void>(() => {});
  const onKeyDown = (e: KeyboardEvent) => {
    if (isTyping(e) || !folders || !plans) return;
    const k = e.key.toLowerCase();
    if (isMod(e) && !e.shiftKey && !e.altKey) {
      if (k === "c") copyOrCut("copy");
      else if (k === "x") copyOrCut("cut");
      else if (k === "v") {
        if (clipboard) paste(clipboard, pasteTarget(clipboard));
        else toast("Gli appunti sono vuoti");
      }
      else if (k === "d") duplicateHere();
      else if (k === "z") undo();
      else if (k === "a") setPicked({ folders: new Set(subfolders.map((f) => f.id)), plans: new Set(visible.map((p) => p.id)) });
      else return;
      e.preventDefault();
      return;
    }
    if (e.key === "Delete" || (e.key === "Backspace" && pickedCount)) {
      if (!pickedCount) return;
      e.preventDefault();
      removePicked();
    } else if (e.key === "Enter" && pickedCount === 1) {
      e.preventDefault();
      openPicked();
    } else if (e.key === "Escape" && pickedCount) {
      setPicked(empty());
    } else if ((e.key === "ArrowDown" || e.key === "ArrowUp") && items.length) {
      e.preventDefault();
      const at = anchor.current ?? (e.key === "ArrowDown" ? -1 : items.length);
      const next = Math.max(0, Math.min(items.length - 1, at + (e.key === "ArrowDown" ? 1 : -1)));
      anchor.current = next;
      const it = items[next];
      setPicked(it.kind === "folder" ? { folders: new Set([it.id]), plans: new Set() } : { folders: new Set(), plans: new Set([it.id]) });
      document.getElementById(`item-${it.id}`)?.scrollIntoView({ block: "nearest" });
    }
  };
  // Il gestore cambia a ogni render (usa lo stato attuale): passa da un ref.
  useEffect(() => {
    keyRef.current = onKeyDown;
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => keyRef.current(e);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (!folders || !plans) return <Loading />;

  async function createPlan(fromTemplateId?: string) {
    try {
      const plan = await api.post<PlanDTO>("/api/plans", {
        folderId: current ? current.id : null,
        fromTemplateId,
      });
      router.push(`/piani/${plan.id}`);
    } catch (e) {
      toast(errorMessage(e), "error");
    }
  }

  async function saveFolder(e: FormEvent) {
    e.preventDefault();
    if (!draft) return;
    setDraftError("");
    try {
      if (draft.id) {
        await api.patch(`/api/folders/${draft.id}`, { name: draft.name, color: draft.color, parentId: draft.parentId });
      } else {
        const created = await api.post<FolderDTO>("/api/folders", draft);
        setSelected(created.id);
      }
      await load();
      setDraft(null);
    } catch (err) {
      setDraftError(errorMessage(err));
    }
  }

  // --- Trascinamento (piani e cartelle selezionati) su una cartella ---
  const dragProps = (kind: "folder" | "plan", id: string) => ({
    draggable: true,
    onDragStart: (e: DragEvent) => {
      // Si trascina la selezione se l'elemento ne fa parte, altrimenti solo l'elemento.
      const it = isPicked(kind, id)
        ? { folderIds: [...picked.folders], planIds: [...picked.plans] }
        : { folderIds: kind === "folder" ? [id] : [], planIds: kind === "plan" ? [id] : [] };
      e.dataTransfer.setData(DRAG_TYPE, JSON.stringify(it));
      e.dataTransfer.effectAllowed = "copyMove";
    },
  });
  const dropProps = (target: string, folderId: string | null) => ({
    onDragOver: (e: DragEvent) => {
      if (!e.dataTransfer.types.includes(DRAG_TYPE)) return;
      e.preventDefault();
      // Con Alt (Option su Mac) si copia invece di spostare, come nel Finder.
      e.dataTransfer.dropEffect = e.altKey ? "copy" : "move";
      setDropTarget(target);
    },
    onDragLeave: () => setDropTarget((t) => (t === target ? null : t)),
    onDrop: (e: DragEvent) => {
      e.preventDefault();
      setDropTarget(null);
      const it = JSON.parse(e.dataTransfer.getData(DRAG_TYPE) || "null") as Omit<Clipboard, "op"> | null;
      if (!it) return;
      // Niente da fare se si lascia un piano nella sua stessa cartella.
      const already = it.folderIds.length === 0 && it.planIds.every((id) => plans!.find((p) => p.id === id)?.folderId === folderId);
      if (it.folderIds.includes(folderId ?? "") || (already && !e.altKey)) return;
      paste({ op: e.altKey ? "copy" : "cut", ...it }, folderId);
    },
  });

  const rowClass = (key: string) =>
    cx(
      "group flex h-9 w-full items-center gap-2 rounded-md pr-1 text-left transition-colors",
      selection === key ? "bg-accent-soft font-medium text-accent" : "hover:bg-sunken",
      dropTarget === key && "ring-2 ring-accent",
    );

  const isCut = (kind: "folder" | "plan", id: string) =>
    clipboard?.op === "cut" && (kind === "folder" ? clipboard.folderIds : clipboard.planIds).includes(id);

  function renderNode(node: FolderNode) {
    const open = !collapsed.has(node.id);
    return (
      <li key={node.id}>
        <div
          className={cx(rowClass(node.id), isCut("folder", node.id) && "opacity-50")}
          style={{ paddingLeft: 4 + node.depth * 16 }}
          {...dropProps(node.id, node.id)}
          {...dragProps("folder", node.id)}
        >
          <button
            type="button"
            aria-label={open ? "Chiudi" : "Apri"}
            onClick={() =>
              setCollapsed((c) => {
                const next = new Set(c);
                if (next.has(node.id)) next.delete(node.id);
                else next.add(node.id);
                return next;
              })
            }
            className={cx("flex size-5 shrink-0 items-center justify-center rounded text-muted hover:bg-line", node.children.length === 0 && "invisible")}
          >
            <ChevronRight className={cx("size-3.5 transition-transform", open && "rotate-90")} />
          </button>
          <button type="button" onClick={() => openFolder(node.id)} className="flex min-w-0 flex-1 items-center gap-2 self-stretch text-left">
            {node.schoolYearId ? (
              <CalendarRange className="size-4 shrink-0" style={{ color: swatch(node.color).solid }} aria-label="Cartella di un anno scolastico" />
            ) : (
              <Folder className="size-4 shrink-0" style={{ color: swatch(node.color).solid }} fill={swatch(node.color).bg} aria-hidden />
            )}
            <span className="truncate">{node.name}</span>
          </button>
          <span className="tabular text-xs text-muted group-focus-within:hidden group-hover:hidden">{node.planCount || ""}</span>
          <span className="hidden group-focus-within:flex group-hover:flex">
            <IconButton label={`Nuova sottocartella in ${node.name}`} className="size-6" onClick={() => setDraft({ name: "", color: node.color, parentId: node.id })}>
              <FolderPlus className="size-3.5" />
            </IconButton>
            <IconButton label={`Modifica ${node.name}`} className="size-6" onClick={() => setDraft({ id: node.id, name: node.name, color: node.color, parentId: node.parentId })}>
              <Pencil className="size-3.5" />
            </IconButton>
          </span>
        </div>
        {open && node.children.length > 0 && <ul>{node.children.map(renderNode)}</ul>}
      </li>
    );
  }

  // Destinazioni valide per una cartella in modifica: non sé stessa né le sue discendenti.
  const editing = draft?.id ? flat.find((f) => f.id === draft.id) : undefined;
  const blocked = new Set(editing ? [editing.id, ...descendantIds(editing)] : []);
  const title = selection === "all" ? "Tutti i piani" : selection === "none" ? "Senza cartella" : current!.name;
  const mod = modLabel();
  const target = pasteTarget(clipboard);

  return (
    <>
      <PageHeader
        title="Cartelle"
        subtitle="Organizza i piani lezione come preferisci: per materia, classe, anno…"
        actions={
          <>
            <Button onClick={() => setDraft({ name: "", color: "teal", parentId: current?.id ?? null })}>
              <FolderPlus className="size-4" /> Nuova cartella
            </Button>
            <Button variant="primary" onClick={() => setNewOpen(true)}>
              <Plus className="size-4" /> Nuovo piano
            </Button>
          </>
        }
      />

      <div className="grid gap-5 lg:grid-cols-[260px_minmax(0,1fr)]">
        <nav aria-label="Cartelle" className="self-start rounded-xl border border-line bg-surface p-2">
          <ul>
            <li>
              <button type="button" onClick={() => openFolder("all")} className={cx(rowClass("all"), "pl-2")}>
                <Layers className="size-4 shrink-0" aria-hidden />
                <span className="flex-1">Tutti i piani</span>
                <span className="tabular pr-1 text-xs text-muted">{plans.length}</span>
              </button>
            </li>
            <li>
              <button type="button" onClick={() => openFolder("none")} className={cx(rowClass("none"), "pl-2")} {...dropProps("none", null)}>
                <Inbox className="size-4 shrink-0" aria-hidden />
                <span className="flex-1">Senza cartella</span>
                <span className="tabular pr-1 text-xs text-muted">{plans.filter((p) => !p.folderId).length || ""}</span>
              </button>
            </li>
          </ul>
          {tree.length > 0 && <ul className="mt-2 border-t border-line pt-2">{tree.map(renderNode)}</ul>}
          {tree.length === 0 && (
            <p className="mt-2 border-t border-line px-2 pt-3 pb-1 text-[13px] text-muted">
              Ancora nessuna cartella. Creane una e trascinaci dentro i piani.
            </p>
          )}
        </nav>

        <section>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <h2 className="flex items-center gap-2 font-display text-xl font-semibold">
              {current?.schoolYearId && <CalendarRange className="size-5 text-accent" aria-hidden />}
              {title}
            </h2>
            <label className="relative">
              <Search className="pointer-events-none absolute top-2.5 left-2.5 size-4 text-muted" aria-hidden />
              <Input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Cerca per titolo"
                aria-label="Cerca per titolo"
                className="w-56 pl-8"
              />
            </label>
          </div>

          {current?.schoolYearId && (
            <p className="mb-3 rounded-lg bg-accent-soft px-3 py-2 text-[13px]">
              Cartella dell&apos;anno scolastico: i piani che copi o sposti qui dentro (anche in una sottocartella, ad esempio con il nome della
              classe) vengono riportati in quest&apos;anno, nella settimana che scegli.
            </p>
          )}

          {/* Barra della selezione e degli appunti */}
          {(pickedCount > 0 || clipboard) && (
            <div className="sticky top-0 z-10 mb-2 flex flex-wrap items-center gap-1.5 rounded-lg border border-line bg-surface px-2 py-1.5 shadow-sm max-md:top-[49px]">
              {pickedCount > 0 ? (
                <>
                  <span className="px-1 text-[13px] font-medium">{pickedCount} selezionati</span>
                  <Button size="sm" variant="ghost" onClick={() => copyOrCut("copy")} title={`${mod}C`}>
                    <Copy className="size-3.5" /> Copia
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => copyOrCut("cut")} title={`${mod}X`}>
                    <Scissors className="size-3.5" /> Taglia
                  </Button>
                  <Button size="sm" variant="ghost" onClick={duplicateHere} title={`${mod}D`}>
                    <CopyPlus className="size-3.5" /> Duplica
                  </Button>
                  <Button size="sm" variant="danger" onClick={removePicked} title="Canc">
                    <Trash2 className="size-3.5" /> Elimina
                  </Button>
                  <IconButton label="Deseleziona (Esc)" onClick={() => setPicked(empty())}>
                    <X className="size-3.5" />
                  </IconButton>
                </>
              ) : (
                <span className="px-1 text-[13px] text-muted">
                  {clipboard!.op === "copy" ? "Copiato" : "Tagliato"}: {describe(clipboard!.folderIds.length, clipboard!.planIds.length)}
                </span>
              )}
              {clipboard && (
                <Button size="sm" className="ml-auto" onClick={() => paste(clipboard, target)} title={`${mod}V`}>
                  <ClipboardPaste className="size-3.5" /> Incolla in {target ? `"${folderName(target)}"` : "Senza cartella"}
                </Button>
              )}
            </div>
          )}

          {items.length === 0 ? (
            <EmptyState
              title={q ? "Nessun piano trovato" : "Nessun piano qui"}
              action={
                !q && (
                  <>
                    <Button variant="primary" onClick={() => createPlan()}>
                      <Plus className="size-4" /> Nuovo piano
                    </Button>
                    {clipboard && (
                      <Button onClick={() => paste(clipboard, target)}>
                        <ClipboardPaste className="size-4" /> Incolla qui
                      </Button>
                    )}
                  </>
                )
              }
            >
              {q ? `Nessun titolo contiene "${query.trim()}".` : "Crea un piano, trascinane uno su questa cartella oppure incollalo qui."}
            </EmptyState>
          ) : (
            <ul
              className="divide-y divide-line rounded-xl border border-line bg-surface select-none"
              aria-label={title}
              aria-multiselectable="true"
              role="listbox"
            >
              {items.map((it, index) => {
                const on = isPicked(it.kind, it.id);
                const base = cx(
                  "group flex cursor-default items-center gap-3 px-3 py-2.5",
                  on ? "bg-accent-soft" : "hover:bg-sunken/60",
                  isCut(it.kind, it.id) && "opacity-50",
                  dropTarget === `row-${it.id}` && "ring-2 ring-accent ring-inset",
                );
                if (it.kind === "folder") {
                  const f = flat.find((x) => x.id === it.id)!;
                  return (
                    <li
                      key={f.id}
                      id={`item-${f.id}`}
                      role="option"
                      aria-selected={on}
                      className={base}
                      onClick={(e) => pick(e, index)}
                      onDoubleClick={() => openFolder(f.id)}
                      {...dragProps("folder", f.id)}
                      {...dropProps(`row-${f.id}`, f.id)}
                    >
                      <Folder className="size-4 shrink-0" style={{ color: swatch(f.color).solid }} fill={swatch(f.color).bg} aria-hidden />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{f.name}</span>
                        <span className="block text-[13px] text-muted">
                          {[f.children.length && count(f.children.length, "sottocartella", "sottocartelle"), count(f.planCount, "piano", "piani")]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                      </span>
                      <IconButton label={`Apri ${f.name}`} onClick={() => openFolder(f.id)}>
                        <ArrowUpRight className="size-4" />
                      </IconButton>
                    </li>
                  );
                }
                const p = plans.find((x) => x.id === it.id)!;
                const folder = flat.find((f) => f.id === p.folderId);
                return (
                  <li
                    key={p.id}
                    id={`item-${p.id}`}
                    role="option"
                    aria-selected={on}
                    className={base}
                    onClick={(e) => pick(e, index)}
                    onDoubleClick={() => router.push(`/piani/${p.id}`)}
                    {...dragProps("plan", p.id)}
                  >
                    <FileText className="size-4 shrink-0 text-muted" aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{p.title || "Senza titolo"}</span>
                      <span className="block truncate text-[13px] text-muted">
                        {[
                          p.date ? humanDate(p.date) : "Senza data",
                          `${p.phaseCount} ${p.phaseCount === 1 ? "fase" : "fasi"} · ${p.totalMin}’`,
                          selection === "all" && folder?.name,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    </span>
                    <IconButton label={`Apri "${p.title || "Senza titolo"}"`} onClick={() => router.push(`/piani/${p.id}`)}>
                      <ArrowUpRight className="size-4" />
                    </IconButton>
                  </li>
                );
              })}
            </ul>
          )}
          <p className="mt-2 text-xs text-muted">
            Clic per selezionare ({mod}clic o Maiusc+clic per più elementi), doppio clic per aprire. {mod}C copia, {mod}X taglia, {mod}V incolla
            nella cartella aperta, {mod}D duplica, {mod}Z annulla, Canc elimina. Trascina su una cartella per spostare (con Alt per copiare).
            Copiando una cartella si copia anche tutto il suo contenuto.
          </p>
        </section>
      </div>

      {/* Nuova cartella / modifica */}
      <Dialog open={!!draft} onClose={() => setDraft(null)} title={draft?.id ? "Modifica cartella" : "Nuova cartella"}>
        {draft && (
          <form onSubmit={saveFolder} className="space-y-4">
            <Field label="Nome">
              <Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} required autoFocus />
            </Field>
            <Field label="Dentro">
              <select className={inputClass} value={draft.parentId ?? ""} onChange={(e) => setDraft({ ...draft, parentId: e.target.value || null })}>
                <option value="">Nessuna (cartella principale)</option>
                {flat
                  .filter((f) => !blocked.has(f.id))
                  .map((f) => (
                    <option key={f.id} value={f.id}>
                      {"  ".repeat(f.depth)}
                      {f.name}
                    </option>
                  ))}
              </select>
            </Field>
            <div>
              <span className="mb-1.5 block text-[13px] font-medium">Colore</span>
              <ColorPicker value={draft.color} onChange={(color) => setDraft({ ...draft, color })} />
            </div>
            <ErrorNote>{draftError}</ErrorNote>
            <div className="flex items-center justify-between gap-2 pt-1">
              {draft.id ? (
                <Button
                  variant="danger"
                  onClick={() => {
                    setDraft(null);
                    removeItems({ folderIds: [draft.id!], planIds: [] });
                  }}
                >
                  <Trash2 className="size-4" /> Elimina
                </Button>
              ) : (
                <span />
              )}
              <div className="flex gap-2">
                <Button onClick={() => setDraft(null)}>Annulla</Button>
                <Button type="submit" variant="primary">
                  Salva
                </Button>
              </div>
            </div>
          </form>
        )}
      </Dialog>

      {/* Nuovo piano: vuoto o da modello */}
      <Dialog open={newOpen} onClose={() => setNewOpen(false)} title="Nuovo piano">
        <ul className="space-y-1.5">
          <li>
            <button type="button" onClick={() => createPlan()} className="flex w-full items-center gap-3 rounded-lg border border-line-strong px-3 py-2.5 text-left hover:border-accent">
              <Plus className="size-4 text-accent" />
              <span className="font-medium">Piano vuoto</span>
            </button>
          </li>
          <li>
            <button
              type="button"
              onClick={() => router.push(`/piani/nuovo${current ? `?folderId=${current.id}` : ""}`)}
              className="flex w-full items-center gap-3 rounded-lg border border-accent bg-accent-soft px-3 py-2.5 text-left"
            >
              <Wand2 className="size-4 text-accent" />
              <span className="font-medium">Creazione guidata</span>
            </button>
          </li>
          {templates.map((t) => (
            <li key={t.id}>
              <button type="button" onClick={() => createPlan(t.id)} className="flex w-full items-center gap-3 rounded-lg border border-line px-3 py-2.5 text-left hover:border-accent">
                <FileText className="size-4 shrink-0 text-muted" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{t.title || "Modello senza titolo"}</span>
                  <span className="block text-[13px] text-muted">
                    Modello · {t.phaseCount} fasi · {t.totalMin}’
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </Dialog>

      <YearProposalDialog
        proposal={proposal}
        onClose={() => setProposal(null)}
        onDone={(n) => {
          setProposal(null);
          toast(n === 1 ? "Piano pianificato nel nuovo anno" : `${n} piani pianificati nel nuovo anno`);
          load();
        }}
      />
    </>
  );
}
