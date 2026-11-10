"use client";

import { Download, FileText, Link2, Pencil, Search, Trash2, Upload, X } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { FileIcon, fileSize, uploadExercises } from "@/components/PlanExercises";
import { Button, cx, Dialog, EmptyState, ErrorNote, Field, IconButton, Input, Loading, PageHeader, useToast } from "@/components/ui";
import { api, errorMessage } from "@/lib/api";
import { EXERCISE_ACCEPT } from "@/lib/file-types";
import { humanDate } from "@/lib/plan-utils";
import type { ExerciseDTO, PlanSummary } from "@/lib/types";

type Filter = "all" | "linked" | "unlinked";

/** Scelta di un piano a cui collegare un esercizio. */
function PlanPicker({ exercise, onClose, onLinked }: { exercise: ExerciseDTO | null; onClose: () => void; onLinked: () => void }) {
  const toast = useToast();
  const [q, setQ] = useState("");
  const [plans, setPlans] = useState<PlanSummary[] | null>(null);
  useEffect(() => {
    if (!exercise) return;
    let stale = false;
    const t = setTimeout(
      () =>
        api.get<PlanSummary[]>(`/api/plans?limit=40${q.trim() ? `&q=${encodeURIComponent(q.trim())}` : ""}`).then(
          (p) => !stale && setPlans(p),
          () => !stale && setPlans([]),
        ),
      150,
    );
    return () => {
      stale = true;
      clearTimeout(t);
    };
  }, [exercise, q]);

  const linked = new Set(exercise?.plans.map((p) => p.id));
  return (
    <Dialog open={!!exercise} onClose={onClose} title={`Collega «${exercise?.title ?? ""}» a un piano`}>
      <label className="relative mb-3 block">
        <Search className="pointer-events-none absolute top-2.5 left-2.5 size-4 text-muted" aria-hidden />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cerca un piano per titolo" className="pl-8" autoFocus />
      </label>
      {!plans ? (
        <Loading />
      ) : plans.length === 0 ? (
        <p className="text-muted">Nessun piano trovato.</p>
      ) : (
        <ul className="space-y-1.5">
          {plans.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                disabled={linked.has(p.id)}
                onClick={() =>
                  api.post(`/api/exercises/${exercise!.id}/plans/${p.id}`).then(
                    () => {
                      toast(`Collegato a "${p.title || "Senza titolo"}"`);
                      onLinked();
                    },
                    (e) => toast(errorMessage(e), "error"),
                  )
                }
                className="flex w-full items-center gap-3 rounded-lg border border-line px-3 py-2 text-left hover:border-accent disabled:opacity-50"
              >
                <FileText className="size-4 shrink-0 text-muted" aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{p.title || "Senza titolo"}</span>
                  <span className="block text-[13px] text-muted">
                    {p.date ? humanDate(p.date) : "Senza data"}
                    {linked.has(p.id) && " · già collegato"}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Dialog>
  );
}

export default function EserciziPage() {
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<ExerciseDTO[] | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [editing, setEditing] = useState<ExerciseDTO | null>(null);
  const [draft, setDraft] = useState({ title: "", note: "" });
  const [editError, setEditError] = useState("");
  const [linking, setLinking] = useState<ExerciseDTO | null>(null);

  const load = useCallback(() => api.get<ExerciseDTO[]>("/api/exercises").then(setItems, (e) => toast(errorMessage(e), "error")), [toast]);
  useEffect(() => {
    load();
  }, [load]);

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    try {
      const created = await uploadExercises(files);
      toast(created.length === 1 ? "Esercizio caricato" : `${created.length} esercizi caricati`);
      await load();
    } catch (e) {
      toast(errorMessage(e), "error");
    }
    setBusy(false);
    if (fileRef.current) fileRef.current.value = "";
  }

  async function saveEdit(e: FormEvent) {
    e.preventDefault();
    if (!editing) return;
    setEditError("");
    try {
      await api.patch(`/api/exercises/${editing.id}`, draft);
      setEditing(null);
      load();
    } catch (err) {
      setEditError(errorMessage(err));
    }
  }

  async function remove(x: ExerciseDTO) {
    const where = x.plans.length ? ` Verrà tolto anche da ${x.plans.length} ${x.plans.length === 1 ? "piano" : "piani"}.` : "";
    if (!confirm(`Eliminare l'esercizio "${x.title}"?${where} Non si può annullare.`)) return;
    try {
      await api.del(`/api/exercises/${x.id}`);
      load();
    } catch (e) {
      toast(errorMessage(e), "error");
    }
  }

  const unlink = (x: ExerciseDTO, planId: string) =>
    api.del(`/api/exercises/${x.id}/plans/${planId}`).then(load, (e) => toast(errorMessage(e), "error"));

  if (!items) return <Loading />;

  const q = query.trim().toLowerCase();
  const visible = items.filter(
    (x) =>
      (!q || x.title.toLowerCase().includes(q) || x.fileName.toLowerCase().includes(q) || x.note.toLowerCase().includes(q)) &&
      (filter === "all" || (filter === "linked" ? x.plans.length > 0 : x.plans.length === 0)),
  );

  return (
    <div
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes("Files")) return;
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={(e) => e.currentTarget === e.target && setDragging(false)}
      onDrop={(e) => {
        if (!e.dataTransfer.files.length) return;
        e.preventDefault();
        setDragging(false);
        upload(e.dataTransfer.files);
      }}
      className={cx("min-h-[60vh] rounded-xl", dragging && "ring-2 ring-accent ring-offset-4 ring-offset-paper")}
    >
      <PageHeader
        title="Esercizi"
        subtitle="Schede ed esercizi (PDF, Word, Excel, PowerPoint, immagini…) da collegare ai piani: un esercizio può servire a più piani, o a nessuno."
        actions={
          <>
            <Button variant="primary" onClick={() => fileRef.current?.click()} loading={busy}>
              <Upload className="size-4" /> Carica file
            </Button>
            <input ref={fileRef} type="file" accept={EXERCISE_ACCEPT} multiple hidden onChange={(e) => upload(e.target.files)} />
          </>
        }
      />

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <label className="relative">
          <Search className="pointer-events-none absolute top-2.5 left-2.5 size-4 text-muted" aria-hidden />
          <Input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Cerca per titolo, file o nota"
            aria-label="Cerca negli esercizi"
            className="w-64 pl-8"
          />
        </label>
        <div className="flex gap-1 rounded-lg bg-sunken p-1" role="tablist">
          {(
            [
              ["all", "Tutti"],
              ["linked", "Collegati"],
              ["unlinked", "Non collegati"],
            ] as [Filter, string][]
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={filter === key}
              onClick={() => setFilter(key)}
              className={cx("h-7 rounded-md px-2.5 text-[13px] font-medium", filter === key ? "bg-surface shadow-sm" : "text-muted hover:text-ink")}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {visible.length === 0 ? (
        <EmptyState
          title={items.length ? "Nessun esercizio trovato" : "Ancora nessun esercizio"}
          action={
            !items.length && (
              <Button variant="primary" onClick={() => fileRef.current?.click()}>
                <Upload className="size-4" /> Carica file
              </Button>
            )
          }
        >
          {items.length ? "Prova a cambiare ricerca o filtro." : "Trascina qui i tuoi file, oppure caricali con il pulsante."}
        </EmptyState>
      ) : (
        <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
          {visible.map((x) => (
            <li key={x.id} className="flex flex-wrap items-start gap-3 px-3 py-2.5">
              <FileIcon fileName={x.fileName} className="mt-0.5 size-5" />
              <div className="min-w-0 flex-1">
                <a href={`/api/exercises/${x.id}/file`} target="_blank" rel="noreferrer" className="block truncate font-medium hover:underline">
                  {x.title}
                </a>
                <p className="truncate text-[13px] text-muted">
                  {x.fileName} · {fileSize(x.size)} · caricato il {humanDate(x.createdAt.slice(0, 10))}
                </p>
                {x.note && <p className="mt-0.5 text-[13px]">{x.note}</p>}
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {x.plans.map((p) => (
                    <span key={p.id} className="flex items-center gap-0.5 rounded-full border border-line-strong py-0.5 pr-0.5 pl-2.5 text-[13px]">
                      <Link href={`/piani/${p.id}`} className="max-w-56 truncate hover:underline">
                        {p.title || "Senza titolo"}
                        {p.date && <span className="text-muted"> · {humanDate(p.date, { year: false })}</span>}
                      </Link>
                      <button
                        type="button"
                        aria-label={`Scollega da ${p.title || "Senza titolo"}`}
                        onClick={() => unlink(x, p.id)}
                        className="flex size-5 items-center justify-center rounded-full text-muted hover:bg-sunken hover:text-ink"
                      >
                        <X className="size-3" />
                      </button>
                    </span>
                  ))}
                  <button
                    type="button"
                    onClick={() => setLinking(x)}
                    className="flex items-center gap-1 rounded-full border border-dashed border-line-strong px-2.5 py-0.5 text-[13px] text-muted hover:border-accent hover:text-accent"
                  >
                    <Link2 className="size-3" /> {x.plans.length ? "Altro piano" : "Collega a un piano"}
                  </button>
                </div>
              </div>
              <div className="flex shrink-0 gap-0.5">
                <a href={`/api/exercises/${x.id}/file?download=1`} aria-label={`Scarica ${x.title}`} title="Scarica">
                  <IconButton label={`Scarica ${x.title}`} tabIndex={-1}>
                    <Download className="size-4" />
                  </IconButton>
                </a>
                <IconButton
                  label={`Modifica ${x.title}`}
                  onClick={() => {
                    setEditing(x);
                    setDraft({ title: x.title, note: x.note });
                    setEditError("");
                  }}
                >
                  <Pencil className="size-4" />
                </IconButton>
                <IconButton label={`Elimina ${x.title}`} className="hover:bg-danger-soft hover:text-danger" onClick={() => remove(x)}>
                  <Trash2 className="size-4" />
                </IconButton>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={!!editing} onClose={() => setEditing(null)} title="Modifica esercizio">
        <form onSubmit={saveEdit} className="space-y-4">
          <Field label="Titolo">
            <Input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} required autoFocus />
          </Field>
          <Field label="Nota" hint="es. livello, soluzioni, per quale classe">
            <Input value={draft.note} onChange={(e) => setDraft({ ...draft, note: e.target.value })} />
          </Field>
          <ErrorNote>{editError}</ErrorNote>
          <div className="flex justify-end gap-2">
            <Button onClick={() => setEditing(null)}>Annulla</Button>
            <Button type="submit" variant="primary">
              Salva
            </Button>
          </div>
        </form>
      </Dialog>

      <PlanPicker
        exercise={linking}
        onClose={() => setLinking(null)}
        onLinked={() => {
          setLinking(null);
          load();
        }}
      />
    </div>
  );
}
