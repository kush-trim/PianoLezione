"use client";

import {
  ChevronRight,
  ExternalLink,
  FileText,
  Folder,
  FolderInput,
  FolderOpen,
  FolderPlus,
  HardDrive,
  Info,
  Link2,
  Pencil,
  Search,
  Share2,
  Trash2,
  TriangleAlert,
  Upload,
  Users,
  X,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { FileIcon, fileSize, uploadExercises } from "@/components/PlanExercises";
import { ShareDialog } from "@/components/ShareDialog";
import { Button, buttonClass, cx, Dialog, EmptyState, ErrorNote, Field, IconButton, Input, Loading, useToast } from "@/components/ui";
import { api, errorMessage } from "@/lib/api";
import { EXERCISE_ACCEPT } from "@/lib/file-types";
import { childrenOf, flattenTree, folderLabel, folderTotals, pathOf } from "@/lib/folder-tree";
import { humanDate } from "@/lib/plan-utils";
import type { ExerciseDTO, FoldersDTO, MaterialFolderDTO, PlanSummary, StorageDTO, UserDTO } from "@/lib/types";

const LAST_FOLDER = "pianostudio:cartella-esercizi";

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Riassunto del contenuto: "3 file · 2 sottocartelle · 1,2 MB", oppure "vuota". */
function contentSummary(t: { files: number; subfolders: number; bytes: number }) {
  if (!t.files && !t.subfolders) return "vuota";
  return [plural(t.files, "file", "file"), t.subfolders ? plural(t.subfolders, "sottocartella", "sottocartelle") : null, t.bytes ? fileSize(t.bytes) : null]
    .filter(Boolean)
    .join(" · ");
}

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

/** Una cartella nell'albero a sinistra, con le sue sottocartelle (apribili). */
function FolderNode({
  f,
  all,
  depth,
  selectedId,
  isOpen,
  onToggle,
  onSelect,
}: {
  f: MaterialFolderDTO;
  all: MaterialFolderDTO[];
  depth: number;
  selectedId: string | null;
  isOpen: (id: string) => boolean;
  onToggle: (id: string, open: boolean) => void;
  onSelect: (id: string) => void;
}) {
  const kids = childrenOf(all, f.id);
  const open = kids.length > 0 && isOpen(f.id);
  const selected = f.id === selectedId;
  const shared = !f.parentId && (f.members.length > 0 || f.role === "member");
  const files = folderTotals(all, f.id).files;
  const Icon = open ? FolderOpen : Folder;
  return (
    <li>
      <div
        className={cx("flex items-center rounded-md transition-colors", selected ? "bg-accent-soft font-medium text-accent" : "hover:bg-sunken")}
        style={{ paddingLeft: depth * 14 }}
      >
        {kids.length ? (
          <button
            type="button"
            onClick={() => onToggle(f.id, !open)}
            aria-expanded={open}
            aria-label={`${open ? "Chiudi" : "Apri"} le sottocartelle di ${f.name}`}
            className="flex size-6 shrink-0 items-center justify-center rounded text-muted hover:text-ink"
          >
            <ChevronRight className={cx("size-3.5 transition-transform", open && "rotate-90")} />
          </button>
        ) : (
          <span className="size-6 shrink-0" />
        )}
        <button
          type="button"
          onClick={() => onSelect(f.id)}
          aria-current={selected ? "true" : undefined}
          className="flex min-w-0 flex-1 items-center gap-2 py-2 pr-2 text-left"
        >
          <Icon className="size-4 shrink-0" aria-hidden />
          <span className="min-w-0 flex-1">
            <span className="block truncate">{f.name}</span>
            {f.role === "member" && !f.parentId && <span className="block truncate text-xs font-normal text-muted">di {f.owner.name}</span>}
          </span>
          {shared && <Users className="size-3.5 shrink-0 text-muted" aria-label="condivisa" />}
          <span className="tabular text-xs text-muted">{files || ""}</span>
        </button>
      </div>
      {open && (
        <ul>
          {kids.map((k) => (
            <FolderNode key={k.id} f={k} all={all} depth={depth + 1} selectedId={selectedId} isOpen={isOpen} onToggle={onToggle} onSelect={onSelect} />
          ))}
        </ul>
      )}
    </li>
  );
}

/** Spazio occupato dai file di PianoStudio sul mio Drive e spazio del Drive intero. */
function StorageBox({ storage }: { storage: StorageDTO | null }) {
  if (!storage) return null;
  const d = storage.drive;
  const pct = (n: number) => (d?.limit ? `${Math.min(100, (n / d.limit) * 100)}%` : "0%");
  return (
    <div className="mt-2 border-t border-line px-2 pt-3 pb-1 text-[13px]">
      <p className="mb-1 text-xs font-semibold tracking-wide text-muted uppercase">Spazio occupato</p>
      <p>
        PianoStudio:{" "}
        {storage.files ? (
          <>
            <span className="font-medium">{fileSize(storage.bytes)}</span>
            <span className="text-muted"> · {plural(storage.files, "file", "file")}</span>
          </>
        ) : (
          <span className="text-muted">nessun file sul tuo Drive</span>
        )}
      </p>
      {d && (
        <>
          {d.limit && (
            <div
              className="mt-1.5 flex h-1.5 overflow-hidden rounded-full bg-sunken"
              role="img"
              aria-label={`Google Drive: usati ${fileSize(d.usage)} di ${fileSize(d.limit)}, di cui ${fileSize(storage.bytes)} da PianoStudio`}
            >
              {/* Anche pochi kB restano visibili. */}
              <span className="bg-accent" style={{ width: storage.bytes ? `max(3px, ${pct(storage.bytes)})` : 0 }} />
              <span className="bg-line-strong" style={{ width: pct(Math.max(0, d.usage - storage.bytes)) }} />
            </div>
          )}
          <p className="mt-1 text-muted">
            Google Drive: {fileSize(d.usage)} {d.limit ? `di ${fileSize(d.limit)}` : "(spazio illimitato)"}
          </p>
        </>
      )}
      <p className="mt-1 text-xs text-muted">Contano anche i file che i colleghi caricano nelle tue cartelle.</p>
    </div>
  );
}

function InfoRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[9rem_minmax(0,1fr)] gap-3 py-2 max-sm:grid-cols-1 max-sm:gap-0.5">
      <dt className="text-muted">{label}</dt>
      <dd className="min-w-0">{children}</dd>
    </div>
  );
}

/** Le informazioni di una cartella: dove sta, di chi è, chi la vede, cosa contiene. */
function FolderInfo({ folder, all, meId, onClose }: { folder: MaterialFolderDTO | null; all: MaterialFolderDTO[]; meId: string; onClose: () => void }) {
  if (!folder) return null;
  const root = folder.rootId ? (all.find((f) => f.id === folder.rootId) ?? folder) : folder;
  const t = folderTotals(all, folder.id);
  const who = (p: { id: string; name: string } | null) => (p ? (p.id === meId ? `${p.name} (tu)` : p.name) : "—");
  return (
    <Dialog open onClose={onClose} title={`Informazioni su «${folder.name}»`}>
      <dl className="divide-y divide-line text-[14px]">
        <InfoRow label="Percorso">PianoStudio / {folderLabel(all, folder.id)}</InfoRow>
        <InfoRow label="Proprietario">
          {who(folder.owner)}
          <span className="block text-[13px] text-muted">I file stanno sul {folder.owner.id === meId ? "tuo" : "suo"} Google Drive.</span>
        </InfoRow>
        <InfoRow label="Creata">
          {humanDate(folder.createdAt.slice(0, 10))}
          {folder.createdBy && folder.createdBy.id !== folder.owner.id && ` da ${who(folder.createdBy)}`}
        </InfoRow>
        <InfoRow label="Condivisa con">
          {root.isDefault ? (
            "Nessuno: è la tua cartella personale"
          ) : root.members.length ? (
            root.members.map((m) => who(m)).join(", ")
          ) : (
            "Nessuno"
          )}
          {folder.rootId && !root.isDefault && <span className="block text-[13px] text-muted">Come la cartella principale «{root.name}».</span>}
          {root.role === "owner" && root.invites.length > 0 && (
            <span className="block text-[13px] text-muted">{plural(root.invites.length, "invito", "inviti")} in attesa</span>
          )}
        </InfoRow>
        <InfoRow label="Contenuto">
          {contentSummary(t)}
          {t.subfolders > 0 && (
            <span className="block text-[13px] text-muted">
              Qui dentro, senza le sottocartelle: {plural(folder.fileCount, "file", "file")}
              {folder.bytes ? `, ${fileSize(folder.bytes)}` : ""}
            </span>
          )}
        </InfoRow>
        <InfoRow label="Spazio occupato">{fileSize(t.bytes)}</InfoRow>
        <InfoRow label="Ultimo file aggiunto">{t.lastFileAt ? humanDate(t.lastFileAt.slice(0, 10)) : "—"}</InfoRow>
        <InfoRow label="Google Drive">
          <a href={folder.driveUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-accent hover:underline">
            Apri la cartella <ExternalLink className="size-3.5" />
          </a>
        </InfoRow>
      </dl>
    </Dialog>
  );
}

/** Sposta un file in un'altra cartella dello stesso Drive. */
function MoveDialog({
  exercise,
  all,
  onClose,
  onMoved,
}: {
  exercise: ExerciseDTO | null;
  all: MaterialFolderDTO[];
  onClose: () => void;
  onMoved: (label: string) => void;
}) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const from = all.find((f) => f.id === exercise?.folderId);
  // Solo le cartelle dello stesso proprietario: il file resta sullo stesso Drive.
  const same = from ? all.filter((f) => f.owner.id === from.owner.id) : [];
  const tree = flattenTree(
    same,
    same.filter((f) => !f.parentId || !same.some((p) => p.id === f.parentId)),
  );

  async function move(to: MaterialFolderDTO) {
    if (!exercise) return;
    setBusy(true);
    try {
      await api.patch(`/api/exercises/${exercise.id}`, { folderId: to.id });
      onMoved(folderLabel(all, to.id));
    } catch (e) {
      toast(errorMessage(e), "error");
    }
    setBusy(false);
  }

  return (
    <Dialog open={!!exercise} onClose={onClose} title={`Sposta «${exercise?.title ?? ""}»`}>
      <p className="mb-3 text-[13px] text-muted">
        Si sposta anche su Google Drive. Le cartelle sono quelle dello stesso Drive{from && from.role === "member" ? ` (di ${from.owner.name})` : ""}.
        Se il file esce da una cartella condivisa, sparisce dai piani dei colleghi che non lo vedono più.
      </p>
      <ul className="max-h-[50vh] space-y-0.5 overflow-y-auto">
        {tree.map(({ folder: f, depth }) => {
          const current = f.id === exercise?.folderId;
          return (
            <li key={f.id}>
              <button
                type="button"
                disabled={current || busy}
                onClick={() => move(f)}
                style={{ paddingLeft: 8 + depth * 18 }}
                className="flex w-full items-center gap-2 rounded-md py-2 pr-2 text-left hover:bg-sunken disabled:cursor-default disabled:hover:bg-transparent"
              >
                <Folder className="size-4 shrink-0 text-muted" aria-hidden />
                <span className={cx("min-w-0 flex-1 truncate", current && "text-muted")}>{f.name}</span>
                {current && <span className="text-xs text-muted">è qui</span>}
              </button>
            </li>
          );
        })}
      </ul>
    </Dialog>
  );
}

export default function EserciziPage() {
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [me, setMe] = useState<UserDTO | null>(null);
  const [data, setData] = useState<FoldersDTO | null>(null);
  const [storage, setStorage] = useState<StorageDTO | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  // Cartelle aperte o chiuse a mano; le altre sono aperte solo se contengono quella scelta.
  const [toggled, setToggled] = useState<Map<string, boolean>>(new Map());
  const [items, setItems] = useState<ExerciseDTO[] | null>(null);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [naming, setNaming] = useState<{ id?: string; parentId?: string; name: string } | null>(null);
  const [nameError, setNameError] = useState("");
  const [sharing, setSharing] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [editing, setEditing] = useState<ExerciseDTO | null>(null);
  const [draft, setDraft] = useState({ title: "", note: "" });
  const [editError, setEditError] = useState("");
  const [linking, setLinking] = useState<ExerciseDTO | null>(null);
  const [moving, setMoving] = useState<ExerciseDTO | null>(null);

  const loadFolders = useCallback(
    () =>
      api.get<FoldersDTO>("/api/material-folders").then(
        (d) => {
          setData(d);
          setSelected((cur) => {
            if (cur && d.folders.some((f) => f.id === cur)) return cur;
            let saved: string | null = null;
            try {
              saved = localStorage.getItem(LAST_FOLDER);
            } catch {}
            return d.folders.find((f) => f.id === saved)?.id ?? d.folders[0]?.id ?? null;
          });
        },
        (e) => toast(errorMessage(e), "error"),
      ),
    [toast],
  );
  const loadStorage = useCallback(() => api.get<StorageDTO>("/api/material-folders/storage").then(setStorage, () => {}), []);
  useEffect(() => {
    loadFolders();
    loadStorage();
    api.get<UserDTO>("/api/auth/me").then(setMe, () => {});
  }, [loadFolders, loadStorage]);

  const q = query.trim();
  const loadItems = useCallback(() => {
    if (!selected && !q) return setItems([]);
    const url = q ? `/api/exercises?q=${encodeURIComponent(q)}` : `/api/exercises?folderId=${selected}`;
    return api.get<ExerciseDTO[]>(url).then(setItems, (e) => toast(errorMessage(e), "error"));
  }, [selected, q, toast]);
  useEffect(() => {
    const t = setTimeout(loadItems, q ? 200 : 0);
    return () => clearTimeout(t);
  }, [loadItems, q]);

  const reload = () => {
    loadFolders();
    loadItems();
    loadStorage();
  };

  function select(id: string) {
    setSelected(id);
    setQuery("");
    // La cartella e quelle che la contengono si riaprono, anche se erano state chiuse a mano.
    if (data) {
      const path = pathOf(data.folders, id);
      setToggled((prev) => {
        const next = new Map(prev);
        for (const a of path) next.delete(a.id);
        return next;
      });
    }
    try {
      localStorage.setItem(LAST_FOLDER, id);
    } catch {}
  }

  async function upload(files: FileList | null) {
    if (!files?.length || !selected) return;
    setBusy(true);
    try {
      const created = await uploadExercises(files, { folderId: selected });
      toast(created.length === 1 ? "File caricato su Google Drive" : `${created.length} file caricati su Google Drive`);
      reload();
    } catch (e) {
      toast(errorMessage(e), "error");
    }
    setBusy(false);
    if (fileRef.current) fileRef.current.value = "";
  }

  async function saveFolder(e: FormEvent) {
    e.preventDefault();
    if (!naming) return;
    setNameError("");
    try {
      if (naming.id) await api.patch(`/api/material-folders/${naming.id}`, { name: naming.name });
      else {
        const created = await api.post<{ id: string }>("/api/material-folders", { name: naming.name, parentId: naming.parentId ?? null });
        await loadFolders();
        select(created.id);
      }
      setNaming(null);
      loadFolders();
    } catch (err) {
      setNameError(errorMessage(err));
    }
  }

  async function deleteFolder(f: MaterialFolderDTO) {
    if (!data) return;
    const t = folderTotals(data.folders, f.id);
    const what = t.files || t.subfolders ? ` con ${contentSummary(t)}` : "";
    const who = !f.parentId && f.members.length ? ` I colleghi con cui è condivisa (${f.members.length}) non la vedranno più.` : "";
    if (!confirm(`Eliminare la cartella «${f.name}»${what}? Su Google Drive va nel cestino (recuperabile per 30 giorni).${who}`)) return;
    try {
      await api.del(`/api/material-folders/${f.id}`);
      setSelected(f.parentId);
      reload();
    } catch (e) {
      toast(errorMessage(e), "error");
    }
  }

  async function saveEdit(e: FormEvent) {
    e.preventDefault();
    if (!editing) return;
    setEditError("");
    try {
      await api.patch(`/api/exercises/${editing.id}`, draft);
      setEditing(null);
      loadItems();
    } catch (err) {
      setEditError(errorMessage(err));
    }
  }

  async function remove(x: ExerciseDTO) {
    const where = x.plans.length ? ` Verrà tolto anche da ${x.plans.length} dei tuoi piani.` : "";
    if (!confirm(`Eliminare "${x.title}"?${where} Su Google Drive va nel cestino.`)) return;
    try {
      await api.del(`/api/exercises/${x.id}`);
      reload();
    } catch (e) {
      toast(errorMessage(e), "error");
    }
  }

  const unlink = (x: ExerciseDTO, planId: string) =>
    api.del(`/api/exercises/${x.id}/plans/${planId}`).then(loadItems, (e) => toast(errorMessage(e), "error"));

  if (!data || !me) return <Loading />;

  const all = data.folders;
  const folder = all.find((f) => f.id === selected) ?? null;
  const path = folder ? pathOf(all, folder.id) : [];
  const root = path[0] ?? null;
  const subfolders = folder && !q ? childrenOf(all, folder.id) : [];
  // Aperte nell'albero: la cartella scelta e quelle che la contengono (salvo scelta diversa a mano).
  const openByDefault = new Set(path.map((f) => f.id));
  const isOpen = (id: string) => toggled.get(id) ?? openByDefault.has(id);
  const toggle = (id: string, open: boolean) => setToggled((prev) => new Map(prev).set(id, open));
  const mine = all.filter((f) => !f.parentId && f.role === "owner");
  const shared = all.filter((f) => !f.parentId && f.role === "member");
  const authorize = `/api/auth/google?drive=1&next=${encodeURIComponent("/esercizi")}`;

  const shareText = (r: MaterialFolderDTO) =>
    r.role === "member" ? `Condivisa da ${r.owner.name}` : r.members.length ? `Condivisa con ${r.members.map((m) => m.name).join(", ")}` : "Solo tua";
  const tree = (roots: MaterialFolderDTO[]) => (
    <ul>
      {roots.map((f) => (
        <FolderNode key={f.id} f={f} all={all} depth={0} selectedId={q ? null : selected} isOpen={isOpen} onToggle={toggle} onSelect={select} />
      ))}
    </ul>
  );

  return (
    <div>
      <header className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-[26px] leading-tight font-semibold">Esercizi</h1>
          <p className="mt-0.5 text-muted">I file stanno su Google Drive, nella cartella «PianoStudio». Le cartelle si possono condividere con i colleghi.</p>
        </div>
        <label className="relative">
          <Search className="pointer-events-none absolute top-2.5 left-2.5 size-4 text-muted" aria-hidden />
          <Input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Cerca in tutte le cartelle"
            aria-label="Cerca negli esercizi"
            className="w-64 pl-8"
          />
        </label>
      </header>

      {!data.driveAuthorized && (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-lg bg-warn-soft px-3 py-2.5 text-[13px] text-warn">
          <TriangleAlert className="size-4 shrink-0" aria-hidden />
          <span className="flex-1">
            Google Drive non è autorizzato per il tuo account: non puoi creare cartelle né caricare nelle tue. Le cartelle che i colleghi
            condividono con te funzionano lo stesso.
          </span>
          <a href={authorize} className={buttonClass("primary", "sm")}>
            <HardDrive className="size-3.5" /> Autorizza Google Drive
          </a>
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[270px_minmax(0,1fr)]">
        <nav aria-label="Cartelle di esercizi" className="self-start rounded-xl border border-line bg-surface p-2">
          <p className="px-2 pt-1 pb-1.5 text-xs font-semibold tracking-wide text-muted uppercase">Le mie cartelle</p>
          {tree(mine)}
          <button
            type="button"
            onClick={() => {
              setNameError("");
              setNaming({ name: "" });
            }}
            disabled={!data.driveAuthorized}
            className="mt-1 flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-muted hover:bg-sunken hover:text-ink disabled:opacity-50"
          >
            <FolderPlus className="size-4" aria-hidden /> Nuova cartella
          </button>
          {shared.length > 0 && (
            <>
              <p className="mt-2 border-t border-line px-2 pt-3 pb-1.5 text-xs font-semibold tracking-wide text-muted uppercase">Condivise con me</p>
              {tree(shared)}
            </>
          )}
          <StorageBox storage={storage} />
        </nav>

        <section
          onDragOver={(e) => {
            if (!folder || q || !e.dataTransfer.types.includes("Files")) return;
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
          className={cx("min-h-[50vh] rounded-xl", dragging && "ring-2 ring-accent ring-offset-4 ring-offset-paper")}
        >
          {q ? (
            <h2 className="mb-3 font-display text-xl font-semibold">Risultati per «{q}»</h2>
          ) : (
            folder &&
            root && (
              <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  {path.length > 1 && (
                    <nav aria-label="Percorso" className="mb-0.5 flex flex-wrap items-center gap-0.5 text-[13px] text-muted">
                      {path.slice(0, -1).map((p) => (
                        <span key={p.id} className="flex items-center gap-0.5">
                          <button type="button" onClick={() => select(p.id)} className="max-w-48 truncate rounded px-1 hover:bg-sunken hover:text-ink">
                            {p.name}
                          </button>
                          <ChevronRight className="size-3.5" aria-hidden />
                        </span>
                      ))}
                    </nav>
                  )}
                  <h2 className="truncate font-display text-xl font-semibold">{folder.name}</h2>
                  <p className="text-[13px] text-muted">
                    {root.isDefault ? "Solo tua" : shareText(root)}
                    {folder.rootId && !root.isDefault && ` · come «${root.name}»`}
                    {root.role === "owner" &&
                      !folder.rootId &&
                      root.invites.length > 0 &&
                      ` · ${plural(root.invites.length, "invito", "inviti")} in attesa`}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <a href={folder.driveUrl} target="_blank" rel="noopener noreferrer" className={buttonClass("ghost", "sm")}>
                    <ExternalLink className="size-3.5" /> Apri in Drive
                  </a>
                  {!root.isDefault && (
                    <Button size="sm" variant="ghost" onClick={() => setSharing(true)}>
                      <Share2 className="size-3.5" /> {root.role === "owner" ? "Condividi" : "Chi ha accesso"}
                    </Button>
                  )}
                  <IconButton label={`Informazioni su ${folder.name}`} onClick={() => setShowInfo(true)}>
                    <Info className="size-4" />
                  </IconButton>
                  <IconButton
                    label={`Nuova sottocartella in ${folder.name}`}
                    onClick={() => {
                      setNameError("");
                      setNaming({ name: "", parentId: folder.id });
                    }}
                  >
                    <FolderPlus className="size-4" />
                  </IconButton>
                  {folder.canManage && !folder.isDefault && (
                    <>
                      <IconButton
                        label={`Rinomina ${folder.name}`}
                        onClick={() => {
                          setNameError("");
                          setNaming({ id: folder.id, name: folder.name });
                        }}
                      >
                        <Pencil className="size-4" />
                      </IconButton>
                      <IconButton label={`Elimina ${folder.name}`} className="hover:bg-danger-soft hover:text-danger" onClick={() => deleteFolder(folder)}>
                        <Trash2 className="size-4" />
                      </IconButton>
                    </>
                  )}
                  <Button size="sm" variant="primary" onClick={() => fileRef.current?.click()} loading={busy}>
                    <Upload className="size-3.5" /> Carica file
                  </Button>
                  <input ref={fileRef} type="file" accept={EXERCISE_ACCEPT} multiple hidden onChange={(e) => upload(e.target.files)} />
                </div>
              </div>
            )
          )}
          {folder?.isDefault && !q && !subfolders.length && (
            <p className="mb-3 text-[13px] text-muted">
              Per condividere esercizi con un collega crea una cartella con «Nuova cartella» e usa «Condividi».
            </p>
          )}

          {subfolders.length > 0 && (
            <ul className="mb-3 divide-y divide-line rounded-xl border border-line bg-surface" aria-label="Sottocartelle">
              {subfolders.map((sf) => (
                <li key={sf.id}>
                  <button type="button" onClick={() => select(sf.id)} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-sunken">
                    <Folder className="size-5 shrink-0 text-muted" aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{sf.name}</span>
                      <span className="block truncate text-[13px] text-muted">{contentSummary(folderTotals(all, sf.id))}</span>
                    </span>
                    <ChevronRight className="size-4 shrink-0 text-muted" aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
          )}

          {!items ? (
            <Loading />
          ) : items.length === 0 ? (
            subfolders.length ? (
              <p className="rounded-xl border border-dashed border-line-strong px-3 py-4 text-center text-[13px] text-muted">
                Nessun file direttamente qui. Trascina i file in questo riquadro per caricarli in «{folder?.name}».
              </p>
            ) : (
              <EmptyState
                title={q ? "Nessun esercizio trovato" : "Cartella vuota"}
                action={
                  !q &&
                  folder && (
                    <Button variant="primary" onClick={() => fileRef.current?.click()}>
                      <Upload className="size-4" /> Carica file
                    </Button>
                  )
                }
              >
                {q ? "Prova con un'altra parola." : "Trascina qui i file (PDF, Word, Excel, PowerPoint, immagini…): vanno su Google Drive."}
              </EmptyState>
            )
          ) : (
            <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
              {items.map((x) => (
                <li key={x.id} className="flex flex-wrap items-start gap-3 px-3 py-2.5">
                  <FileIcon fileName={x.fileName} className="mt-0.5 size-5" />
                  <div className="min-w-0 flex-1">
                    <a href={x.url} target="_blank" rel="noopener noreferrer" className="block truncate font-medium hover:underline">
                      {x.title}
                    </a>
                    <p className="truncate text-[13px] text-muted">
                      {[
                        x.fileName,
                        x.size ? fileSize(x.size) : null,
                        q && x.folderId ? `in «${folderLabel(all, x.folderId) || x.folderName}»` : null,
                        x.uploadedBy && x.uploadedBy.id !== me.id ? `caricato da ${x.uploadedBy.name}` : null,
                        humanDate(x.createdAt.slice(0, 10), { year: false }),
                      ]
                        .filter(Boolean)
                        .join(" · ")}
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
                  {x.canEdit && (
                    <div className="flex shrink-0 gap-0.5">
                      {x.folderId && (
                        <IconButton label={`Sposta ${x.title}`} onClick={() => setMoving(x)}>
                          <FolderInput className="size-4" />
                        </IconButton>
                      )}
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
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <Dialog
        open={!!naming}
        onClose={() => setNaming(null)}
        title={naming?.id ? "Rinomina cartella" : naming?.parentId ? `Nuova sottocartella in «${all.find((f) => f.id === naming.parentId)?.name ?? ""}»` : "Nuova cartella"}
      >
        {naming && (
          <form onSubmit={saveFolder} className="space-y-4">
            <Field
              label="Nome"
              hint={
                naming.id
                  ? "Il nome cambia anche su Google Drive."
                  : naming.parentId
                    ? "es. Verifiche, Schede, Soluzioni. Chi vede la cartella vede anche la sottocartella."
                    : "es. Esercizi prima media. La cartella nasce sul tuo Google Drive."
              }
            >
              <Input value={naming.name} onChange={(e) => setNaming({ ...naming, name: e.target.value })} required autoFocus />
            </Field>
            <ErrorNote>{nameError}</ErrorNote>
            <div className="flex justify-end gap-2">
              <Button onClick={() => setNaming(null)}>Annulla</Button>
              <Button type="submit" variant="primary">
                {naming.id ? "Salva" : "Crea"}
              </Button>
            </div>
          </form>
        )}
      </Dialog>

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

      {sharing && (
        <ShareDialog
          folder={root}
          meId={me.id}
          onClose={() => setSharing(false)}
          onChanged={loadFolders}
          onLeft={() => {
            setSharing(false);
            setSelected(null);
            loadFolders();
          }}
        />
      )}

      {showInfo && <FolderInfo folder={folder} all={all} meId={me.id} onClose={() => setShowInfo(false)} />}

      <MoveDialog
        exercise={moving}
        all={all}
        onClose={() => setMoving(null)}
        onMoved={(label) => {
          setMoving(null);
          toast(`Spostato in «${label}»`);
          reload();
        }}
      />

      <PlanPicker
        exercise={linking}
        onClose={() => setLinking(null)}
        onLinked={() => {
          setLinking(null);
          loadItems();
        }}
      />
    </div>
  );
}
