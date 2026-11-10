"use client";

import { CalendarDays, FileText, Folder, FolderTree, LayoutTemplate, Paperclip, Plus, Search, Settings, type LucideIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { humanDate } from "@/lib/plan-utils";
import type { ExerciseDTO, FolderDTO, PlanSummary } from "@/lib/types";
import { FileIcon } from "./PlanExercises";
import { cx, isMod, modLabel } from "./ui";

type Result = { key: string; group: string; label: string; hint?: string; icon: LucideIcon | null; fileName?: string; go: () => void };

const PAGES: { label: string; href: string; icon: LucideIcon; words: string }[] = [
  { label: "Settimana", href: "/settimana", icon: CalendarDays, words: "orario calendario lezioni" },
  { label: "Cartelle", href: "/cartelle", icon: FolderTree, words: "piani" },
  { label: "Esercizi", href: "/esercizi", icon: Paperclip, words: "pdf file schede" },
  { label: "Modelli", href: "/modelli", icon: LayoutTemplate, words: "template" },
  { label: "Nuovo piano (creazione guidata)", href: "/piani/nuovo", icon: Plus, words: "crea" },
  { label: "Impostazioni", href: "/impostazioni", icon: Settings, words: "anno vacanze verbi" },
  { label: "Impostazioni · Accesso API", href: "/impostazioni#api", icon: Settings, words: "token" },
];

/** Ricerca rapida (⌘K / Ctrl+K): pagine, cartelle, piani ed esercizi. */
export function CommandPalette() {
  const router = useRouter();
  const ref = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const [folders, setFolders] = useState<FolderDTO[]>([]);
  const [plans, setPlans] = useState<PlanSummary[]>([]);
  const [exercises, setExercises] = useState<ExerciseDTO[]>([]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isMod(e) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) {
      el.showModal();
      api.get<FolderDTO[]>("/api/folders").then(setFolders, () => {});
    }
    if (!open && el.open) el.close();
  }, [open]);

  // Piani ed esercizi si cercano sul server mentre si scrive.
  useEffect(() => {
    if (!open) return;
    let stale = false;
    const term = q.trim();
    const t = setTimeout(() => {
      api.get<PlanSummary[]>(`/api/plans?limit=8${term ? `&q=${encodeURIComponent(term)}` : ""}`).then((p) => !stale && setPlans(p), () => {});
      if (term) api.get<ExerciseDTO[]>(`/api/exercises?q=${encodeURIComponent(term)}`).then((x) => !stale && setExercises(x.slice(0, 5)), () => {});
      else setExercises([]);
    }, 120);
    return () => {
      stale = true;
      clearTimeout(t);
    };
  }, [q, open]);

  const close = () => {
    setOpen(false);
    setQ("");
    setActive(0);
  };
  const go = (href: string) => () => {
    close();
    router.push(href);
  };

  const term = q.trim().toLowerCase();
  const results: Result[] = [
    ...PAGES.filter((p) => !term || `${p.label} ${p.words}`.toLowerCase().includes(term)).map((p) => ({
      key: `page-${p.href}`,
      group: "Pagine",
      label: p.label,
      icon: p.icon,
      go: go(p.href),
    })),
    ...(term ? folders.filter((f) => f.name.toLowerCase().includes(term)).slice(0, 6) : []).map((f) => ({
      key: `folder-${f.id}`,
      group: "Cartelle",
      label: f.name,
      hint: f.planCount ? `${f.planCount} piani` : undefined,
      icon: Folder,
      go: go(`/cartelle?folder=${f.id}`),
    })),
    ...plans.map((p) => ({
      key: `plan-${p.id}`,
      group: term ? "Piani" : "Piani recenti",
      label: p.title || "Senza titolo",
      hint: p.date ? humanDate(p.date, { year: false }) : undefined,
      icon: FileText,
      go: go(`/piani/${p.id}`),
    })),
    ...exercises.map((x) => ({
      key: `ex-${x.id}`,
      group: "Esercizi",
      label: x.title,
      hint: x.fileName,
      icon: null,
      fileName: x.fileName,
      go: () => {
        close();
        window.open(`/api/exercises/${x.id}/file`, "_blank");
      },
    })),
  ];
  const current = Math.min(active, Math.max(0, results.length - 1));

  return (
    <dialog
      ref={ref}
      onClose={close}
      onClick={(e) => e.target === ref.current && close()}
      aria-label="Ricerca rapida"
      className="mx-auto mt-[12vh] w-[calc(100vw-2rem)] max-w-xl rounded-xl border border-line bg-surface p-0 text-ink shadow-2xl backdrop:bg-ink/40"
    >
      {open && (
        <div className="flex max-h-[70vh] flex-col">
          <label className="flex items-center gap-2 border-b border-line px-4">
            <Search className="size-4 shrink-0 text-muted" aria-hidden />
            <input
              autoFocus
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setActive(0);
              }}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                  e.preventDefault();
                  setActive((a) => (a + (e.key === "ArrowDown" ? 1 : -1) + results.length) % Math.max(1, results.length));
                } else if (e.key === "Enter" && results[current]) {
                  e.preventDefault();
                  results[current].go();
                }
              }}
              placeholder="Cerca piani, cartelle, esercizi, pagine…"
              aria-label="Cerca"
              className="h-12 w-full bg-transparent text-[15px] outline-none focus-visible:outline-none"
            />
            <kbd className="shrink-0 rounded border border-line px-1.5 text-xs text-muted">Esc</kbd>
          </label>
          <ul className="overflow-y-auto p-1.5" role="listbox">
            {results.length === 0 && <li className="px-3 py-6 text-center text-muted">Nessun risultato</li>}
            {results.map((r, i) => {
              const Icon = r.icon;
              return (
                <li key={r.key} role="option" aria-selected={i === current}>
                  {(i === 0 || results[i - 1].group !== r.group) && (
                    <p className="px-2.5 pt-2 pb-1 text-[11px] font-semibold tracking-wide text-muted uppercase">{r.group}</p>
                  )}
                  <button
                    type="button"
                    onClick={r.go}
                    onMouseMove={() => setActive(i)}
                    className={cx("flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left", i === current && "bg-accent-soft")}
                  >
                    {Icon ? <Icon className="size-4 shrink-0 text-muted" aria-hidden /> : <FileIcon fileName={r.fileName ?? ""} />}
                    <span className="min-w-0 flex-1 truncate">{r.label}</span>
                    {r.hint && <span className="shrink-0 text-[13px] text-muted">{r.hint}</span>}
                  </button>
                </li>
              );
            })}
          </ul>
          <p className="border-t border-line px-4 py-2 text-xs text-muted">
            ↑↓ per scegliere · Invio per aprire · {modLabel()}K per aprire e chiudere
          </p>
        </div>
      )}
    </dialog>
  );
}
