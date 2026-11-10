"use client";

import { File as FileGeneric, FileImage, FileSpreadsheet, FileText, FileType, Link2, Presentation, Search, Unlink, Upload } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { api, errorMessage } from "@/lib/api";
import { EXERCISE_ACCEPT, kindOf, type FileKind } from "@/lib/file-types";
import type { ExerciseDTO, ExerciseRef } from "@/lib/types";
import { Button, Dialog, EmptyState, IconButton, Input, Loading, useToast } from "./ui";

export const fileSize = (bytes: number) =>
  bytes < 1_000_000 ? `${Math.max(1, Math.round(bytes / 1000))} kB` : `${(bytes / 1_000_000).toFixed(1).replace(".", ",")} MB`;

const ICONS: Record<FileKind, typeof FileGeneric> = {
  pdf: FileText,
  word: FileType,
  excel: FileSpreadsheet,
  powerpoint: Presentation,
  immagine: FileImage,
  testo: FileText,
  altro: FileGeneric,
};
const COLORS: Partial<Record<FileKind, string>> = {
  pdf: "text-danger",
  word: "text-[#2b579a]",
  excel: "text-ok",
  powerpoint: "text-warn",
};

/** Icona del file secondo il tipo (PDF, Word, Excel…). */
export function FileIcon({ fileName, className = "size-4" }: { fileName: string; className?: string }) {
  const kind = kindOf(fileName);
  const Icon = ICONS[kind];
  return <Icon className={`${className} shrink-0 ${COLORS[kind] ?? "text-muted"}`} aria-hidden />;
}

/** Carica uno o più file come esercizi; con planId li collega subito al piano. */
export async function uploadExercises(files: FileList | File[], planId?: string): Promise<ExerciseDTO[]> {
  const form = new FormData();
  for (const f of Array.from(files)) form.append("file", f);
  if (planId) form.set("planId", planId);
  const res = await fetch("/api/exercises", { method: "POST", body: form });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error ?? "Caricamento non riuscito");
  return data;
}

/** Scelta di un esercizio già caricato da collegare al piano. */
function ExercisePicker({
  open,
  linked,
  onClose,
  onPick,
}: {
  open: boolean;
  linked: string[];
  onClose: () => void;
  onPick: (e: ExerciseDTO) => void;
}) {
  const [all, setAll] = useState<ExerciseDTO[] | null>(null);
  const [q, setQ] = useState("");
  useEffect(() => {
    if (!open) return;
    api.get<ExerciseDTO[]>("/api/exercises").then(setAll, () => setAll([]));
  }, [open]);
  const needle = q.trim().toLowerCase();
  const list = (all ?? []).filter(
    (e) => !linked.includes(e.id) && (!needle || e.title.toLowerCase().includes(needle) || e.fileName.toLowerCase().includes(needle)),
  );
  return (
    <Dialog open={open} onClose={onClose} title="Collega un esercizio">
      <label className="relative mb-3 block">
        <Search className="pointer-events-none absolute top-2.5 left-2.5 size-4 text-muted" aria-hidden />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cerca negli esercizi" className="pl-8" autoFocus />
      </label>
      {!all ? (
        <Loading />
      ) : list.length === 0 ? (
        <EmptyState title={all.length ? "Nessun esercizio trovato" : "Nessun esercizio caricato"}>
          {all.length ? "Prova con un'altra parola." : "Caricane uno con «Carica file»."}
        </EmptyState>
      ) : (
        <ul className="space-y-1.5">
          {list.map((e) => (
            <li key={e.id}>
              <button
                type="button"
                onClick={() => onPick(e)}
                className="flex w-full items-center gap-3 rounded-lg border border-line px-3 py-2 text-left hover:border-accent"
              >
                <FileIcon fileName={e.fileName} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{e.title}</span>
                  <span className="block truncate text-[13px] text-muted">
                    {fileSize(e.size)} · {e.plans.length ? `in ${e.plans.length} ${e.plans.length === 1 ? "piano" : "piani"}` : "non ancora usato"}
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

/** Gli esercizi (file) collegati a un piano: aprire, collegare, caricare, scollegare. */
export function PlanExercises({
  planId,
  exercises,
  onChange,
}: {
  planId: string;
  exercises: ExerciseRef[];
  onChange: (exercises: ExerciseRef[]) => void;
}) {
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState(false);

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    try {
      const created = await uploadExercises(files, planId);
      onChange([...exercises, ...created]);
      toast(created.length === 1 ? "Esercizio caricato" : `${created.length} esercizi caricati`);
    } catch (e) {
      toast(errorMessage(e), "error");
    }
    setBusy(false);
    if (fileRef.current) fileRef.current.value = "";
  }

  async function link(e: ExerciseDTO) {
    setPicking(false);
    try {
      await api.post(`/api/exercises/${e.id}/plans/${planId}`);
      onChange([...exercises, e]);
    } catch (err) {
      toast(errorMessage(err), "error");
    }
  }

  async function unlink(e: ExerciseRef) {
    try {
      await api.del(`/api/exercises/${e.id}/plans/${planId}`);
      onChange(exercises.filter((x) => x.id !== e.id));
      toast(`"${e.title}" scollegato: resta negli Esercizi`);
    } catch (err) {
      toast(errorMessage(err), "error");
    }
  }

  return (
    <section
      onDragOver={(e) => e.dataTransfer.types.includes("Files") && e.preventDefault()}
      onDrop={(e) => {
        if (!e.dataTransfer.files.length) return;
        e.preventDefault();
        upload(e.dataTransfer.files);
      }}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold">Esercizi</h2>
        <div className="flex gap-1.5">
          <Button size="sm" variant="ghost" onClick={() => setPicking(true)}>
            <Link2 className="size-3.5" /> Collega esistente
          </Button>
          <Button size="sm" variant="ghost" onClick={() => fileRef.current?.click()} loading={busy}>
            <Upload className="size-3.5" /> Carica file
          </Button>
          <input ref={fileRef} type="file" accept={EXERCISE_ACCEPT} multiple hidden onChange={(e) => upload(e.target.files)} />
        </div>
      </div>
      {exercises.length === 0 ? (
        <p className="mt-1.5 rounded-md border border-dashed border-line-strong px-3 py-2 text-muted">
          Nessun esercizio. Trascina qui un file (PDF, Word, Excel, PowerPoint, immagini…) o collegane uno già caricato.
        </p>
      ) : (
        <ul className="mt-1.5 divide-y divide-line rounded-md border border-line bg-surface">
          {exercises.map((e) => (
            <li key={e.id} className="flex items-center gap-3 px-3 py-2">
              <FileIcon fileName={e.fileName} />
              <a href={`/api/exercises/${e.id}/file`} target="_blank" rel="noreferrer" className="min-w-0 flex-1 hover:underline">
                <span className="block truncate font-medium">{e.title}</span>
                <span className="block truncate text-[13px] text-muted">
                  {e.fileName} · {fileSize(e.size)}
                </span>
              </a>
              <IconButton label={`Scollega ${e.title}`} onClick={() => unlink(e)}>
                <Unlink className="size-4" />
              </IconButton>
            </li>
          ))}
        </ul>
      )}
      <ExercisePicker open={picking} linked={exercises.map((e) => e.id)} onClose={() => setPicking(false)} onPick={link} />
    </section>
  );
}
