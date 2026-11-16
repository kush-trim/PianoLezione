"use client";

import { File as FileGeneric, FileImage, FileSpreadsheet, FileText, FileType, Link2, Presentation, Search, Unlink, Upload } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { api, errorMessage } from "@/lib/api";
import { EXERCISE_ACCEPT, kindOf, type FileKind } from "@/lib/file-types";
import { flattenTree } from "@/lib/folder-tree";
import type { ExerciseDTO, ExerciseRef, FoldersDTO } from "@/lib/types";
import { Button, Dialog, EmptyState, IconButton, Input, Loading, useToast } from "./ui";
import { TagList } from "./Tags";

const LAST_FOLDER = "pianostudio:cartella-esercizi";

export const fileSize = (bytes: number) =>
  bytes <= 0
    ? "0 kB"
    : bytes < 1_000_000
      ? `${Math.max(1, Math.round(bytes / 1000))} kB`
      : bytes < 1_000_000_000
        ? `${(bytes / 1_000_000).toFixed(1).replace(".", ",")} MB`
        : `${(bytes / 1_000_000_000).toFixed(1).replace(".", ",")} GB`;

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

/**
 * Carica uno o più file su Google Drive, nella cartella indicata (predefinita: "I miei file");
 * con planId li collega subito al piano.
 */
export async function uploadExercises(
  files: FileList | File[],
  opts: { folderId?: string | null; planId?: string } = {},
): Promise<ExerciseDTO[]> {
  const form = new FormData();
  for (const f of Array.from(files)) form.append("file", f);
  if (opts.folderId) form.set("folderId", opts.folderId);
  if (opts.planId) form.set("planId", opts.planId);
  const res = await fetch("/api/exercises", { method: "POST", body: form });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error ?? "Caricamento non riuscito");
  return data;
}

/** Scelta di un file già caricato da collegare al piano. */
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
    <Dialog open={open} onClose={onClose} title="Collega un file">
      <label className="relative mb-3 block">
        <Search className="pointer-events-none absolute top-2.5 left-2.5 size-4 text-muted" aria-hidden />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cerca nei file" className="pl-8" autoFocus />
      </label>
      {!all ? (
        <Loading />
      ) : list.length === 0 ? (
        <EmptyState title={all.length ? "Nessun file trovato" : "Nessun file caricato"}>
          {all.length ? "Prova con un'altra parola." : "Caricane uno con «Carica file»: va sul tuo Google Drive."}
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
                  <span className="flex items-center gap-1.5">
                    <span className="truncate font-medium">{e.title}</span>
                    <TagList tags={e.tags} small />
                  </span>
                  <span className="block truncate text-[13px] text-muted">
                    {[e.folderName, e.size ? fileSize(e.size) : null, e.plans.length ? `in ${e.plans.length} ${e.plans.length === 1 ? "piano" : "piani"}` : "non ancora usato"].filter(Boolean).join(" · ")}
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

/** I file collegati a un piano: aprire, collegare, caricare, scollegare. */
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
  const [folders, setFolders] = useState<FoldersDTO | null>(null);
  const [folderId, setFolderId] = useState<string>("");

  // Le cartelle in cui caricare: le mie e quelle condivise con me. Si ricorda l'ultima usata.
  useEffect(() => {
    let stale = false;
    api.get<FoldersDTO>("/api/material-folders").then(
      (d) => {
        if (stale) return;
        setFolders(d);
        let saved = "";
        try {
          saved = localStorage.getItem(LAST_FOLDER) ?? "";
        } catch {}
        setFolderId(d.folders.find((f) => f.id === saved)?.id ?? d.folders[0]?.id ?? "");
      },
      () => {},
    );
    return () => {
      stale = true;
    };
  }, []);

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    try {
      const created = await uploadExercises(files, { folderId: folderId || null, planId });
      onChange([...exercises, ...created]);
      try {
        if (folderId) localStorage.setItem(LAST_FOLDER, folderId);
      } catch {}
      toast(created.length === 1 ? "File caricato su Google Drive" : `${created.length} file caricati su Google Drive`);
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
      toast(`"${e.title}" scollegato: resta in File`);
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
        <h2 className="font-semibold">File</h2>
        <div className="flex gap-1.5">
          <Button size="sm" variant="ghost" onClick={() => setPicking(true)}>
            <Link2 className="size-3.5" /> Collega esistente
          </Button>
          {folders && folders.folders.length > 1 && (
            <select
              value={folderId}
              onChange={(e) => setFolderId(e.target.value)}
              aria-label="Cartella in cui caricare"
              title="Cartella di Google Drive in cui caricare"
              className="h-7 max-w-44 rounded-md border border-line-strong bg-surface px-1.5 text-[13px] text-muted"
            >
              {/* Le sottocartelle sotto la loro cartella, rientrate. */}
              {flattenTree(
                folders.folders,
                folders.folders.filter((f) => !f.parentId),
              ).map(({ folder: f, depth }) => (
                <option key={f.id} value={f.id}>
                  {"   ".repeat(depth)}
                  {f.name}
                  {f.role === "member" && !f.parentId ? ` (di ${f.owner.name})` : ""}
                </option>
              ))}
            </select>
          )}
          <Button size="sm" variant="ghost" onClick={() => fileRef.current?.click()} loading={busy} disabled={!!folders && !folders.folders.length}>
            <Upload className="size-3.5" /> Carica file
          </Button>
          <input ref={fileRef} type="file" accept={EXERCISE_ACCEPT} multiple hidden onChange={(e) => upload(e.target.files)} />
        </div>
      </div>
      {exercises.length === 0 ? (
        <p className="mt-1.5 rounded-md border border-dashed border-line-strong px-3 py-2 text-muted">
          Nessun file. Trascinane qui uno (PDF, Word, Excel, PowerPoint, immagini…): va su Google Drive. Oppure collegane uno già caricato, anche da una cartella condivisa.
        </p>
      ) : (
        <ul className="mt-1.5 divide-y divide-line rounded-md border border-line bg-surface">
          {exercises.map((e) => (
            <li key={e.id} className="flex items-center gap-3 px-3 py-2">
              <FileIcon fileName={e.fileName} />
              <a href={e.url} target="_blank" rel="noopener noreferrer" className="min-w-0 flex-1 hover:underline">
                <span className="flex items-center gap-1.5">
                  <span className="truncate font-medium">{e.title}</span>
                  <TagList tags={e.tags} small />
                </span>
                <span className="block truncate text-[13px] text-muted">
                  {[e.fileName, e.size ? fileSize(e.size) : null, e.folderName ? `in «${e.folderName}»` : null].filter(Boolean).join(" · ")}
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
