"use client";

import { ChevronRight, Copy, FileText, Folder, FolderPlus, Inbox, Layers, Pencil, Plus, Search, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, type DragEvent, type FormEvent } from "react";
import { Button, ColorPicker, cx, Dialog, EmptyState, ErrorNote, Field, IconButton, Input, inputClass, Loading, PageHeader, useToast } from "@/components/ui";
import { api, errorMessage } from "@/lib/api";
import { swatch } from "@/lib/colors";
import { buildTree, descendantIds, flattenTree, type FolderNode } from "@/lib/folders";
import { humanDate } from "@/lib/plan-utils";
import type { FolderDTO, PlanDTO, PlanSummary } from "@/lib/types";

// "all" = tutti i piani, "none" = senza cartella, altrimenti l'id della cartella.
type Selection = "all" | "none" | string;
type FolderDraft = { id?: string; name: string; color: string; parentId: string | null };

const DRAG_TYPE = "application/x-pianostudio-plan";

export default function CartellePage() {
  const router = useRouter();
  const toast = useToast();
  const [folders, setFolders] = useState<FolderDTO[] | null>(null);
  const [plans, setPlans] = useState<PlanSummary[] | null>(null);
  const [templates, setTemplates] = useState<PlanSummary[]>([]);
  const [selected, setSelected] = useState<Selection>("all");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState<FolderDraft | null>(null);
  const [draftError, setDraftError] = useState("");
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [newOpen, setNewOpen] = useState(false);

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

  const tree = useMemo(() => buildTree(folders ?? []), [folders]);
  const flat = useMemo(() => flattenTree(tree), [tree]);
  const current = flat.find((f) => f.id === selected);

  if (!folders || !plans) return <Loading />;

  // Se la cartella selezionata è stata eliminata si torna a "Tutti i piani".
  const selection: Selection = selected === "all" || selected === "none" || current ? selected : "all";
  const q = query.trim().toLowerCase();
  const visible = plans.filter((p) => {
    if (q && !p.title.toLowerCase().includes(q)) return false;
    if (selection === "all") return true;
    if (selection === "none") return p.folderId === null;
    return p.folderId === selection;
  });

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

  async function movePlan(planId: string, folderId: string | null) {
    const plan = plans!.find((p) => p.id === planId);
    if (!plan || plan.folderId === folderId) return;
    try {
      await api.put(`/api/plans/${planId}`, { folderId });
      await load();
      toast(folderId ? `Spostato in "${flat.find((f) => f.id === folderId)?.name}"` : "Tolto dalla cartella");
    } catch (e) {
      toast(errorMessage(e), "error");
    }
  }

  async function duplicatePlan(p: PlanSummary) {
    try {
      await api.post(`/api/plans/${p.id}/duplicate`, {});
      await load();
      toast("Piano duplicato");
    } catch (e) {
      toast(errorMessage(e), "error");
    }
  }

  async function deletePlan(p: PlanSummary) {
    if (!confirm(`Eliminare il piano "${p.title || "Senza titolo"}"? Non si può annullare.`)) return;
    try {
      await api.del(`/api/plans/${p.id}`);
      await load();
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

  async function deleteFolder(f: FolderNode) {
    const subs = descendantIds(f).length;
    const msg =
      `Eliminare la cartella "${f.name}"` +
      (subs ? ` e le sue ${subs} sottocartelle` : "") +
      "? I piani al suo interno non vengono eliminati: restano senza cartella.";
    if (!confirm(msg)) return;
    try {
      await api.del(`/api/folders/${f.id}`);
      setSelected("all");
      await load();
    } catch (e) {
      toast(errorMessage(e), "error");
    }
  }

  // --- Trascinamento di un piano su una cartella ---
  const dropProps = (target: string, folderId: string | null) => ({
    onDragOver: (e: DragEvent) => {
      if (!e.dataTransfer.types.includes(DRAG_TYPE)) return;
      e.preventDefault();
      setDropTarget(target);
    },
    onDragLeave: () => setDropTarget((t) => (t === target ? null : t)),
    onDrop: (e: DragEvent) => {
      e.preventDefault();
      setDropTarget(null);
      movePlan(e.dataTransfer.getData(DRAG_TYPE), folderId);
    },
  });

  const rowClass = (key: string) =>
    cx(
      "group flex h-9 w-full items-center gap-2 rounded-md pr-1 text-left transition-colors",
      selection === key ? "bg-accent-soft font-medium text-accent" : "hover:bg-sunken",
      dropTarget === key && "ring-2 ring-accent",
    );

  function renderNode(node: FolderNode) {
    const open = !collapsed.has(node.id);
    return (
      <li key={node.id}>
        <div className={rowClass(node.id)} style={{ paddingLeft: 4 + node.depth * 16 }} {...dropProps(node.id, node.id)}>
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
          <button type="button" onClick={() => setSelected(node.id)} className="flex min-w-0 flex-1 items-center gap-2 self-stretch text-left">
            <Folder className="size-4 shrink-0" style={{ color: swatch(node.color).solid }} fill={swatch(node.color).bg} aria-hidden />
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
            <IconButton label={`Elimina ${node.name}`} className="size-6 hover:bg-danger-soft hover:text-danger" onClick={() => deleteFolder(node)}>
              <Trash2 className="size-3.5" />
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
            <Button variant="primary" onClick={() => (templates.length ? setNewOpen(true) : createPlan())}>
              <Plus className="size-4" /> Nuovo piano
            </Button>
          </>
        }
      />

      <div className="grid gap-5 lg:grid-cols-[260px_minmax(0,1fr)]">
        <nav aria-label="Cartelle" className="self-start rounded-xl border border-line bg-surface p-2">
          <ul>
            <li>
              <button type="button" onClick={() => setSelected("all")} className={cx(rowClass("all"), "pl-2")}>
                <Layers className="size-4 shrink-0" aria-hidden />
                <span className="flex-1">Tutti i piani</span>
                <span className="tabular pr-1 text-xs text-muted">{plans.length}</span>
              </button>
            </li>
            <li>
              <button type="button" onClick={() => setSelected("none")} className={cx(rowClass("none"), "pl-2")} {...dropProps("none", null)}>
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
            <h2 className="font-display text-xl font-semibold">{title}</h2>
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

          {visible.length === 0 ? (
            <EmptyState
              title={q ? "Nessun piano trovato" : "Nessun piano qui"}
              action={
                !q && (
                  <Button variant="primary" onClick={() => createPlan()}>
                    <Plus className="size-4" /> Nuovo piano
                  </Button>
                )
              }
            >
              {q ? `Nessun titolo contiene "${query.trim()}".` : "Crea un piano, oppure trascinane uno su questa cartella."}
            </EmptyState>
          ) : (
            <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
              {visible.map((p) => {
                const folder = flat.find((f) => f.id === p.folderId);
                return (
                  <li
                    key={p.id}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData(DRAG_TYPE, p.id);
                      e.dataTransfer.effectAllowed = "move";
                    }}
                    className="group flex items-center gap-3 px-3 py-2.5 hover:bg-sunken/60"
                  >
                    <FileText className="size-4 shrink-0 text-muted" aria-hidden />
                    <Link href={`/piani/${p.id}`} className="min-w-0 flex-1">
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
                    </Link>
                    <select
                      aria-label={`Sposta "${p.title || "Senza titolo"}" in una cartella`}
                      value={p.folderId ?? ""}
                      onChange={(e) => movePlan(p.id, e.target.value || null)}
                      className="h-7 max-w-36 rounded-md border border-line-strong bg-surface px-1.5 text-[13px] text-muted max-sm:hidden"
                    >
                      <option value="">Senza cartella</option>
                      {flat.map((f) => (
                        <option key={f.id} value={f.id}>
                          {"  ".repeat(f.depth)}
                          {f.name}
                        </option>
                      ))}
                    </select>
                    <IconButton label={`Duplica "${p.title || "Senza titolo"}"`} onClick={() => duplicatePlan(p)}>
                      <Copy className="size-4" />
                    </IconButton>
                    <IconButton label={`Elimina "${p.title || "Senza titolo"}"`} className="hover:bg-danger-soft hover:text-danger" onClick={() => deletePlan(p)}>
                      <Trash2 className="size-4" />
                    </IconButton>
                  </li>
                );
              })}
            </ul>
          )}
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
                      {"  ".repeat(f.depth)}
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
            <div className="flex justify-end gap-2 pt-1">
              <Button onClick={() => setDraft(null)}>Annulla</Button>
              <Button type="submit" variant="primary">
                Salva
              </Button>
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
    </>
  );
}
