"use client";

import {
  ChevronRight,
  Copy,
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
  Tag,
  Trash2,
  TriangleAlert,
  Upload,
  Users,
  X,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type DragEvent, type FormEvent, type MouseEvent, type ReactNode } from "react";
import { FileIcon, fileSize, uploadExercises } from "@/components/PlanExercises";
import { ShareDialog } from "@/components/ShareDialog";
import { TagChip, TagEditor, TagList } from "@/components/Tags";
import { Button, buttonClass, cx, Dialog, EmptyState, ErrorNote, Field, IconButton, Input, isMod, isTyping, Loading, modLabel, useToast } from "@/components/ui";
import { api, errorMessage } from "@/lib/api";
import { EXERCISE_ACCEPT, extensionOf } from "@/lib/file-types";
import { childrenOf, flattenTree, folderLabel, folderTotals, pathOf, subtreeIds } from "@/lib/folder-tree";
import { humanDate } from "@/lib/plan-utils";
import { normalizeTags, sortTags, tagKey } from "@/lib/tags";
import type { ExerciseDTO, FolderCopyDTO, FoldersDTO, MaterialFolderDTO, PlanSummary, StorageDTO, TagCountDTO, UserDTO } from "@/lib/types";

const LAST_FOLDER = "pianostudio:cartella-esercizi";
/** Trascinamento interno: file o cartelle da spostare su una cartella. */
const DRAG_TYPE = "application/x-pianostudio-file";

/** Gestori per trascinare e lasciare sulle cartelle (albero e sottocartelle). */
type Dnd = {
  over: string | null;
  folderDrop: (f: MaterialFolderDTO) => {
    onDragOver: (e: DragEvent) => void;
    onDragLeave: () => void;
    onDrop: (e: DragEvent) => void;
  };
  folderDrag: (f: MaterialFolderDTO) => { draggable?: boolean; onDragStart?: (e: DragEvent) => void };
};

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Riassunto del contenuto: "3 file · 2 sottocartelle · 1,2 MB", oppure "vuota". */
function contentSummary(t: { files: number; subfolders: number; bytes: number }) {
  if (!t.files && !t.subfolders) return "vuota";
  return [plural(t.files, "file", "file"), t.subfolders ? plural(t.subfolders, "sottocartella", "sottocartelle") : null, t.bytes ? fileSize(t.bytes) : null]
    .filter(Boolean)
    .join(" · ");
}

/** Scelta di un piano a cui collegare un file. */
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
  dnd,
}: {
  f: MaterialFolderDTO;
  all: MaterialFolderDTO[];
  depth: number;
  selectedId: string | null;
  isOpen: (id: string) => boolean;
  onToggle: (id: string, open: boolean) => void;
  onSelect: (id: string) => void;
  dnd: Dnd;
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
        className={cx(
          "flex items-center rounded-md transition-colors",
          selected ? "bg-accent-soft font-medium text-accent" : "hover:bg-sunken",
          dnd.over === f.id && "ring-2 ring-accent",
        )}
        style={{ paddingLeft: depth * 14 }}
        {...dnd.folderDrop(f)}
        {...dnd.folderDrag(f)}
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
            <FolderNode key={k.id} f={k} all={all} depth={depth + 1} selectedId={selectedId} isOpen={isOpen} onToggle={onToggle} onSelect={onSelect} dnd={dnd} />
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
              <span
                className="bg-accent"
                style={{
                  width: storage.bytes ? `max(3px, ${pct(storage.bytes)})` : 0,
                }}
              />
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
          {root.isDefault ? "Nessuno: è la tua cartella personale" : root.members.length ? root.members.map((m) => who(m)).join(", ") : "Nessuno"}
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

/**
 * Scelta della cartella di destinazione, tra quelle dello stesso Drive (stesso proprietario).
 * Serve per spostare file (uno o più) e cartelle.
 */
function FolderPickerDialog({
  title,
  intro,
  all,
  ownerId,
  exclude = new Set(),
  current,
  rootLabel,
  onClose,
  onPick,
}: {
  title: string;
  intro: ReactNode;
  all: MaterialFolderDTO[];
  /** null: niente da proporre (es. file su Drive diversi). */
  ownerId: string | null;
  exclude?: Set<string>;
  /** Dove sta adesso (si vede ma non si sceglie). */
  current: string | null;
  /** Se c'è, la prima riga mette tra le cartelle principali. */
  rootLabel?: string;
  onClose: () => void;
  onPick: (to: MaterialFolderDTO | null) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const same = ownerId ? all.filter((f) => f.owner.id === ownerId && !exclude.has(f.id)) : [];
  const tree = flattenTree(
    same,
    same.filter((f) => !f.parentId || !same.some((p) => p.id === f.parentId)),
  );
  const pick = async (to: MaterialFolderDTO | null) => {
    setBusy(true);
    await onPick(to);
    setBusy(false);
  };
  const row = "flex w-full items-center gap-2 rounded-md py-2 pr-2 text-left hover:bg-sunken disabled:cursor-default disabled:hover:bg-transparent";

  return (
    <Dialog open onClose={() => !busy && onClose()} title={title}>
      <div className="mb-3 text-[13px] text-muted">{intro}</div>
      <ul className="max-h-[50vh] space-y-0.5 overflow-y-auto">
        {rootLabel && (
          <li>
            <button type="button" disabled={busy || current === null} onClick={() => pick(null)} style={{ paddingLeft: 8 }} className={row}>
              <FolderOpen className="size-4 shrink-0 text-muted" aria-hidden />
              <span className={cx("min-w-0 flex-1 truncate", current === null && "text-muted")}>{rootLabel}</span>
              {current === null && <span className="text-xs text-muted">è qui</span>}
            </button>
          </li>
        )}
        {tree.map(({ folder: f, depth }) => {
          const here = f.id === current;
          return (
            <li key={f.id}>
              <button type="button" disabled={here || busy} onClick={() => pick(f)} style={{ paddingLeft: 8 + (depth + (rootLabel ? 1 : 0)) * 18 }} className={row}>
                <Folder className="size-4 shrink-0 text-muted" aria-hidden />
                <span className={cx("min-w-0 flex-1 truncate", here && "text-muted")}>{f.name}</span>
                {here && <span className="text-xs text-muted">è qui</span>}
              </button>
            </li>
          );
        })}
      </ul>
    </Dialog>
  );
}

/** Etichette di più file insieme: si aggiungono o tolgono a tutti; le altre restano come sono. */
function BulkTagDialog({ files, onClose, onSaved }: { files: ExerciseDTO[]; onClose: () => void; onSaved: (changed: number) => void }) {
  const toast = useToast();
  // Le etichette che hanno tutti i file selezionati.
  const common = files.length ? files[0].tags.filter((t) => files.every((x) => x.tags.some((y) => tagKey(y) === tagKey(t)))) : [];
  const [tags, setTags] = useState<string[]>(common);
  const [used, setUsed] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    api.get<TagCountDTO[]>("/api/exercises/tags").then((t) => setUsed(t.map((x) => x.tag)), () => {});
  }, []);

  async function save() {
    setBusy(true);
    const removed = new Set(common.filter((t) => !tags.some((x) => tagKey(x) === tagKey(t))).map(tagKey));
    let changed = 0;
    try {
      for (const x of files) {
        const next = normalizeTags([...x.tags.filter((t) => !removed.has(tagKey(t))), ...tags]);
        if (next.map(tagKey).join("|") === x.tags.map(tagKey).join("|")) continue;
        await api.patch(`/api/exercises/${x.id}`, { tags: next });
        changed++;
      }
      onSaved(changed);
    } catch (e) {
      toast(errorMessage(e), "error");
      setBusy(false);
    }
  }

  return (
    <Dialog
      open
      onClose={() => !busy && onClose()}
      title={`Etichette di ${plural(files.length, "file", "file")}`}
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>
            Annulla
          </Button>
          <Button variant="primary" onClick={save} loading={busy}>
            Salva
          </Button>
        </>
      }
    >
      <TagEditor value={tags} onChange={setTags} used={used} />
      <p className="mt-3 text-[13px] text-muted">
        Quelle attive le hanno tutti i file selezionati: attivandone una la ricevono tutti, disattivandola la perdono tutti. Le etichette che hanno solo alcuni file restano
        come sono.
      </p>
    </Dialog>
  );
}

const dateTime = (iso: string) =>
  new Date(iso).toLocaleString("it-CH", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

/** Le informazioni di un file: cosa è, dove sta, chi l'ha caricato e quando, dove è usato. */
function FileInfo({ file, all, meId, onClose }: { file: ExerciseDTO | null; all: MaterialFolderDTO[]; meId: string; onClose: () => void }) {
  if (!file) return null;
  const who = (p: { id: string; name: string } | null) => (p ? (p.id === meId ? `${p.name} (tu)` : p.name) : "—");
  const ext = extensionOf(file.fileName).toUpperCase();
  return (
    <Dialog open onClose={onClose} title={`Informazioni su «${file.title}»`}>
      <dl className="divide-y divide-line text-[14px]">
        <InfoRow label="File">
          {file.fileName}
          <span className="block text-[13px] text-muted">{[ext || null, file.size ? fileSize(file.size) : null].filter(Boolean).join(" · ")}</span>
        </InfoRow>
        <InfoRow label="Cartella">{file.folderId ? `PianoStudio / ${folderLabel(all, file.folderId) || file.folderName}` : "—"}</InfoRow>
        <InfoRow label="Caricato da">
          {who(file.uploadedBy)}
          <span className="block text-[13px] text-muted">{dateTime(file.createdAt)}</span>
        </InfoRow>
        {file.copiedFrom && <InfoRow label="Copiato da">la cartella {file.copiedFrom}</InfoRow>}
        <InfoRow label="Sul Drive di">{who(file.owner)}</InfoRow>
        <InfoRow label="Etichette">{file.tags.length ? <TagList tags={file.tags} /> : "Nessuna"}</InfoRow>
        {file.note && <InfoRow label="Nota">{file.note}</InfoRow>}
        <InfoRow label="Nei tuoi piani">
          {file.plans.length ? (
            <ul className="space-y-0.5">
              {file.plans.map((p) => (
                <li key={p.id}>
                  <Link href={`/piani/${p.id}`} className="text-accent hover:underline">
                    {p.title || "Senza titolo"}
                  </Link>
                  {p.date && <span className="text-muted"> · {humanDate(p.date)}</span>}
                </li>
              ))}
            </ul>
          ) : (
            "In nessuno"
          )}
        </InfoRow>
        <InfoRow label="Google Drive">
          <a href={file.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-accent hover:underline">
            Apri il file <ExternalLink className="size-3.5" />
          </a>
        </InfoRow>
      </dl>
    </Dialog>
  );
}

/** Etichette di un file: le può cambiare chiunque veda il file. */
function TagDialog({ file, onClose, onSaved }: { file: ExerciseDTO | null; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [tags, setTags] = useState<string[]>(file?.tags ?? []);
  const [used, setUsed] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    api.get<TagCountDTO[]>("/api/exercises/tags").then(
      (t) => setUsed(t.map((x) => x.tag)),
      () => {},
    );
  }, []);
  if (!file) return null;

  async function save() {
    setBusy(true);
    try {
      await api.patch(`/api/exercises/${file!.id}`, { tags });
      onSaved();
    } catch (e) {
      toast(errorMessage(e), "error");
    }
    setBusy(false);
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={`Etichette di «${file.title}»`}
      footer={
        <>
          <Button onClick={onClose}>Annulla</Button>
          <Button variant="primary" onClick={save} loading={busy}>
            Salva
          </Button>
        </>
      }
    >
      <TagEditor value={tags} onChange={setTags} used={used} />
      <p className="mt-3 text-[13px] text-muted">Le etichette le vede chiunque abbia accesso al file.</p>
    </Dialog>
  );
}

/** Copia una cartella (con sottocartelle e file) sul mio Drive, come nuova cartella tra le mie. */
function CopyDialog({
  folder,
  all,
  onClose,
  onCopied,
}: {
  folder: MaterialFolderDTO | null;
  all: MaterialFolderDTO[];
  onClose: () => void;
  onCopied: (r: FolderCopyDTO) => void;
}) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  if (!folder) return null;
  const t = folderTotals(all, folder.id);

  async function copy() {
    setBusy(true);
    try {
      onCopied(await api.post<FolderCopyDTO>(`/api/material-folders/${folder!.id}/copy`));
    } catch (e) {
      toast(errorMessage(e), "error");
      setBusy(false);
    }
  }

  return (
    <Dialog
      open
      onClose={() => !busy && onClose()}
      title={`Copia «${folder.name}» nel tuo Drive`}
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>
            Annulla
          </Button>
          <Button variant="primary" onClick={copy} loading={busy}>
            <Copy className="size-4" /> Copia
          </Button>
        </>
      }
    >
      <div className="space-y-3 text-[14px]">
        <p>
          Nasce una nuova cartella «{folder.name}» tra <span className="font-medium">le tue cartelle</span>, sul tuo Google Drive, con{" "}
          {t.files || t.subfolders ? contentSummary(t) : "nulla dentro: la cartella è vuota"}.
        </p>
        <p className="text-[13px] text-muted">
          La copia è tua: resta anche se {folder.role === "member" ? `${folder.owner.name} cambia o elimina l'originale` : "cambi o elimini l'originale"}. Si copiano
          titoli, note ed etichette; i collegamenti ai piani no.
        </p>
        {busy && <p className="text-[13px] text-muted">Copia in corso… con molti file può volerci qualche minuto.</p>}
      </div>
    </Dialog>
  );
}

export default function FilePage() {
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
  const [naming, setNaming] = useState<{
    id?: string;
    parentId?: string;
    name: string;
  } | null>(null);
  const [nameError, setNameError] = useState("");
  const [sharing, setSharing] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [editing, setEditing] = useState<ExerciseDTO | null>(null);
  const [draft, setDraft] = useState({ title: "", note: "" });
  const [editError, setEditError] = useState("");
  const [linking, setLinking] = useState<ExerciseDTO | null>(null);
  // File da spostare (uno o più), cartella da spostare, etichette di più file.
  const [moveFiles, setMoveFiles] = useState<ExerciseDTO[] | null>(null);
  const [movingFolder, setMovingFolder] = useState<MaterialFolderDTO | null>(null);
  const [bulkTags, setBulkTags] = useState<ExerciseDTO[] | null>(null);
  // File selezionati (caselle) e cartella su cui si sta trascinando.
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [over, setOver] = useState<string | null>(null);
  const anchor = useRef<number | null>(null);
  const [tagging, setTagging] = useState<ExerciseDTO | null>(null);
  const [fileInfo, setFileInfo] = useState<ExerciseDTO | null>(null);
  const [copying, setCopying] = useState<MaterialFolderDTO | null>(null);
  // Filtro per etichetta sui file mostrati (cartella o risultati della ricerca).
  const [tagFilter, setTagFilter] = useState<string | null>(null);

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
  const keyRef = useRef<(e: KeyboardEvent) => void>(() => {});
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => keyRef.current(e);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
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
    setTagFilter(null);
    setPicked(new Set());
    anchor.current = null;
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
      if (naming.id)
        await api.patch(`/api/material-folders/${naming.id}`, {
          name: naming.name,
        });
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

  /** Sposta i file uno per uno; alla fine un messaggio con quanti sono andati e cosa non è andato. */
  async function moveFilesTo(files: ExerciseDTO[], to: MaterialFolderDTO, label: string) {
    let moved = 0;
    const errors: string[] = [];
    for (const x of files) {
      if (x.folderId === to.id) continue;
      try {
        await api.patch(`/api/exercises/${x.id}`, { folderId: to.id });
        moved++;
      } catch (e) {
        errors.push(`«${x.title}»: ${errorMessage(e)}`);
      }
    }
    if (moved) toast(`${plural(moved, "file spostato", "file spostati")} in «${label}»`);
    if (errors.length) toast(errors.join(" · "), "error");
    setPicked(new Set());
    reload();
  }

  async function moveFolderTo(src: MaterialFolderDTO, to: MaterialFolderDTO | null, label: string) {
    try {
      await api.patch(`/api/material-folders/${src.id}`, { parentId: to?.id ?? null });
      toast(`«${src.name}» spostata in «${label}»`);
      reload();
    } catch (e) {
      toast(errorMessage(e), "error");
    }
  }

  async function removeMany(files: ExerciseDTO[]) {
    const mine = files.filter((x) => x.canEdit);
    const others = files.length - mine.length;
    if (!mine.length) return toast("Questi file li può eliminare solo chi li ha caricati o il proprietario della cartella", "error");
    const skip = others ? ` (${plural(others, "file resta", "file restano")}: li può eliminare solo chi li ha caricati o il proprietario della cartella)` : "";
    if (!confirm(`Eliminare ${plural(mine.length, "file", "file")}${skip}? Su Google Drive vanno nel cestino; spariscono anche dai piani.`)) return;
    let gone = 0;
    for (const x of mine) {
      try {
        await api.del(`/api/exercises/${x.id}`);
        gone++;
      } catch (e) {
        toast(`«${x.title}»: ${errorMessage(e)}`, "error");
      }
    }
    if (gone) toast(`${plural(gone, "file eliminato", "file eliminati")}`);
    setPicked(new Set());
    reload();
  }

  const unlink = (x: ExerciseDTO, planId: string) => api.del(`/api/exercises/${x.id}/plans/${planId}`).then(loadItems, (e) => toast(errorMessage(e), "error"));

  // Le etichette dei file mostrati, con quanti file le hanno; il filtro tiene solo quei file.
  const tagCounts = new Map<string, { tag: string; n: number }>();
  for (const x of items ?? []) {
    for (const t of x.tags)
      tagCounts.set(tagKey(t), {
        tag: t,
        n: (tagCounts.get(tagKey(t))?.n ?? 0) + 1,
      });
  }
  const visibleTags = sortTags([...tagCounts.values()].map((c) => c.tag));
  const activeFilter = tagFilter && tagCounts.has(tagKey(tagFilter)) ? tagFilter : null;
  const shown = (items ?? []).filter((x) => !activeFilter || x.tags.some((t) => tagKey(t) === tagKey(activeFilter)));

  const pickedFiles = shown.filter((x) => picked.has(x.id));
  // Tastiera: ⌘/Ctrl+A seleziona tutti, Esc toglie la selezione, Canc elimina i selezionati.
  const onKeyDown = (e: KeyboardEvent) => {
    if (isTyping(e) || document.querySelector("dialog[open]")) return;
    if (isMod(e) && e.key.toLowerCase() === "a" && shown.length) {
      e.preventDefault();
      setPicked(new Set(shown.map((x) => x.id)));
    } else if (e.key === "Escape" && picked.size) {
      setPicked(new Set());
    } else if ((e.key === "Delete" || e.key === "Backspace") && pickedFiles.length) {
      e.preventDefault();
      removeMany(pickedFiles);
    }
  };

  useEffect(() => {
    keyRef.current = onKeyDown;
  });

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
  const authorize = `/api/auth/google?drive=1&next=${encodeURIComponent("/file")}`;

  const togglePick = (e: MouseEvent, index: number) => {
    const x = shown[index];
    const next = new Set(picked);
    if (e.shiftKey && anchor.current !== null) {
      // Maiusc: tutto l'intervallo dall'ultimo scelto.
      const [a, b] = [Math.min(anchor.current, index), Math.max(anchor.current, index)];
      for (const y of shown.slice(a, b + 1)) next.add(y.id);
    } else if (next.has(x.id)) next.delete(x.id);
    else next.add(x.id);
    anchor.current = index;
    setPicked(next);
  };

  const label = (id: string | null) => (id ? folderLabel(all, id) : "Le mie cartelle");
  const dnd: Dnd = {
    over,
    folderDrop: (target) => ({
      onDragOver: (e) => {
        if (!e.dataTransfer.types.includes(DRAG_TYPE)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        setOver(target.id);
      },
      onDragLeave: () => setOver((o) => (o === target.id ? null : o)),
      onDrop: (e) => {
        if (!e.dataTransfer.types.includes(DRAG_TYPE)) return;
        e.preventDefault();
        e.stopPropagation();
        setOver(null);
        let payload: { files?: string[]; folder?: string } | null = null;
        try {
          payload = JSON.parse(e.dataTransfer.getData(DRAG_TYPE));
        } catch {}
        if (payload?.folder) {
          const src = all.find((x) => x.id === payload.folder);
          if (src && src.id !== target.id && src.parentId !== target.id) moveFolderTo(src, target, label(target.id));
        } else if (payload?.files?.length) {
          moveFilesTo(
            (items ?? []).filter((x) => payload!.files!.includes(x.id)),
            target,
            label(target.id),
          );
        }
      },
    }),
    folderDrag: (src) =>
      src.canManage && !src.isDefault
        ? {
            draggable: true,
            onDragStart: (e) => {
              e.stopPropagation();
              e.dataTransfer.setData(DRAG_TYPE, JSON.stringify({ folder: src.id }));
              e.dataTransfer.effectAllowed = "move";
            },
          }
        : {},
  };
  const fileDrag = (x: ExerciseDTO) =>
    x.canEdit && x.folderId
      ? {
          draggable: true,
          onDragStart: (e: DragEvent) => {
            // Si trascina la selezione se il file ne fa parte, altrimenti solo lui.
            const ids = picked.has(x.id) ? pickedFiles.filter((y) => y.canEdit).map((y) => y.id) : [x.id];
            e.dataTransfer.setData(DRAG_TYPE, JSON.stringify({ files: ids }));
            e.dataTransfer.effectAllowed = "move";
          },
        }
      : {};
  const shareText = (r: MaterialFolderDTO) =>
    r.role === "member" ? `Condivisa da ${r.owner.name}` : r.members.length ? `Condivisa con ${r.members.map((m) => m.name).join(", ")}` : "Solo tua";
  const tree = (roots: MaterialFolderDTO[]) => (
    <ul>
      {roots.map((f) => (
        <FolderNode key={f.id} f={f} all={all} depth={0} selectedId={q ? null : selected} isOpen={isOpen} onToggle={toggle} onSelect={select} dnd={dnd} />
      ))}
    </ul>
  );

  return (
    <div>
      <header className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-[26px] leading-tight font-semibold">File</h1>
          <p className="mt-0.5 text-muted">I file stanno su Google Drive, nella cartella «PianoStudio». Le cartelle si possono condividere con i colleghi.</p>
        </div>
        <label className="relative">
          <Search className="pointer-events-none absolute top-2.5 left-2.5 size-4 text-muted" aria-hidden />
          <Input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Cerca in tutte le cartelle"
            aria-label="Cerca nei file"
            className="w-64 pl-8"
          />
        </label>
      </header>

      {!data.driveAuthorized && (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-lg bg-warn-soft px-3 py-2.5 text-[13px] text-warn">
          <TriangleAlert className="size-4 shrink-0" aria-hidden />
          <span className="flex-1">
            Google Drive non è autorizzato per il tuo account: non puoi creare cartelle né caricare nelle tue. Le cartelle che i colleghi condividono con te funzionano lo
            stesso.
          </span>
          <a href={authorize} className={buttonClass("primary", "sm")}>
            <HardDrive className="size-3.5" /> Autorizza Google Drive
          </a>
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[270px_minmax(0,1fr)]">
        <nav aria-label="Cartelle di file" className="self-start rounded-xl border border-line bg-surface p-2">
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
                    {root.role === "owner" && !folder.rootId && root.invites.length > 0 && ` · ${plural(root.invites.length, "invito", "inviti")} in attesa`}
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
                  {folder.role === "member" ? (
                    <Button size="sm" variant="ghost" onClick={() => setCopying(folder)} disabled={!data.driveAuthorized}>
                      <Copy className="size-3.5" /> Copia nel mio Drive
                    </Button>
                  ) : (
                    <IconButton label={`Copia ${folder.name} (duplica)`} onClick={() => setCopying(folder)} disabled={!data.driveAuthorized}>
                      <Copy className="size-4" />
                    </IconButton>
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
                      <IconButton label={`Sposta ${folder.name}`} onClick={() => setMovingFolder(folder)}>
                        <FolderInput className="size-4" />
                      </IconButton>
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
            <p className="mb-3 text-[13px] text-muted">Per condividere file con un collega crea una cartella con «Nuova cartella» e usa «Condividi».</p>
          )}

          {subfolders.length > 0 && (
            <ul className="mb-3 divide-y divide-line rounded-xl border border-line bg-surface" aria-label="Sottocartelle">
              {subfolders.map((sf) => (
                <li key={sf.id} {...dnd.folderDrop(sf)} {...dnd.folderDrag(sf)} className={cx(over === sf.id && "rounded-xl ring-2 ring-accent ring-inset")}>
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

          {visibleTags.length > 0 && (
            <div className="mb-2 flex flex-wrap items-center gap-1.5" role="group" aria-label="Filtra per etichetta">
              <button
                type="button"
                onClick={() => setTagFilter(null)}
                aria-pressed={!activeFilter}
                className={cx(
                  "rounded-full border px-2.5 py-0.5 text-[13px]",
                  !activeFilter ? "border-ink bg-ink font-medium text-paper" : "border-line-strong text-muted hover:text-ink",
                )}
              >
                Tutti · {items?.length ?? 0}
              </button>
              {visibleTags.map((t) => {
                const on = !!activeFilter && tagKey(activeFilter) === tagKey(t);
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setTagFilter(on ? null : t)}
                    aria-pressed={on}
                    className={cx(
                      "rounded-full transition-opacity",
                      on ? "ring-2 ring-ink ring-offset-1 ring-offset-paper" : activeFilter && "opacity-60 hover:opacity-100",
                    )}
                  >
                    <TagChip tag={t} label={`${t} · ${tagCounts.get(tagKey(t))!.n}`} />
                  </button>
                );
              })}
            </div>
          )}

          {pickedFiles.length > 0 && (
            <div className="sticky top-0 z-10 mb-2 flex flex-wrap items-center gap-1.5 rounded-lg border border-line bg-surface px-2 py-1.5 shadow-sm max-md:top-[49px]">
              <span className="px-1 text-[13px] font-medium">{pickedFiles.length} selezionati</span>
              <Button size="sm" variant="ghost" onClick={() => setMoveFiles(pickedFiles.filter((x) => x.canEdit && x.folderId))}>
                <FolderInput className="size-3.5" /> Sposta
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setBulkTags(pickedFiles)}>
                <Tag className="size-3.5" /> Etichette
              </Button>
              <Button size="sm" variant="danger" onClick={() => removeMany(pickedFiles)} title="Canc">
                <Trash2 className="size-3.5" /> Elimina
              </Button>
              {pickedFiles.length < shown.length && (
                <Button size="sm" variant="ghost" onClick={() => setPicked(new Set(shown.map((x) => x.id)))} title={`${modLabel()}A`}>
                  Seleziona tutti
                </Button>
              )}
              <IconButton label="Deseleziona (Esc)" className="ml-auto" onClick={() => setPicked(new Set())}>
                <X className="size-3.5" />
              </IconButton>
            </div>
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
                title={q ? "Nessun file trovato" : "Cartella vuota"}
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
              {shown.map((x) => (
                <li
                  key={x.id}
                  className={cx("flex flex-wrap items-start gap-3 px-3 py-2.5", picked.has(x.id) && "bg-accent-soft/60")}
                  {...fileDrag(x)}
                >
                  <input
                    type="checkbox"
                    checked={picked.has(x.id)}
                    onClick={(e) => togglePick(e, shown.indexOf(x))}
                    onChange={() => {}}
                    aria-label={`Seleziona ${x.title}`}
                    className="mt-1 size-4 shrink-0 cursor-pointer accent-accent"
                  />
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
                    {x.tags.length > 0 && (
                      <div className="mt-1">
                        <TagList tags={x.tags} />
                      </div>
                    )}
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
                  {/* Sul telefono i pulsanti vanno sotto, per lasciare spazio al nome. */}
                  <div className="flex shrink-0 gap-0.5 max-sm:w-full max-sm:pl-8">
                    <IconButton label={`Informazioni su ${x.title}`} onClick={() => setFileInfo(x)}>
                      <Info className="size-4" />
                    </IconButton>
                    <IconButton label={`Etichette di ${x.title}`} onClick={() => setTagging(x)}>
                      <Tag className="size-4" />
                    </IconButton>
                    {x.canEdit && (
                      <>
                        {x.folderId && (
                          <IconButton label={`Sposta ${x.title}`} onClick={() => setMoveFiles([x])}>
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
                      </>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
          {shown.length > 0 && (
            <p className="mt-2 text-xs text-muted">
              Seleziona più file con le caselle (Maiusc per un intervallo, {modLabel()}A per tutti, Esc per togliere la selezione, Canc per eliminarli). Trascina file e
              cartelle su una cartella, a sinistra o qui sopra, per spostarli.
            </p>
          )}
        </section>
      </div>

      <Dialog
        open={!!naming}
        onClose={() => setNaming(null)}
        title={
          naming?.id ? "Rinomina cartella" : naming?.parentId ? `Nuova sottocartella in «${all.find((f) => f.id === naming.parentId)?.name ?? ""}»` : "Nuova cartella"
        }
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

      <Dialog open={!!editing} onClose={() => setEditing(null)} title="Modifica file">
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

      {fileInfo && <FileInfo file={fileInfo} all={all} meId={me.id} onClose={() => setFileInfo(null)} />}

      {tagging && (
        <TagDialog
          key={tagging.id}
          file={tagging}
          onClose={() => setTagging(null)}
          onSaved={() => {
            setTagging(null);
            loadItems();
          }}
        />
      )}

      {copying && (
        <CopyDialog
          folder={copying}
          all={all}
          onClose={() => setCopying(null)}
          onCopied={async (r) => {
            setCopying(null);
            toast(
              r.failed.length
                ? `Copiata in «${r.name}», ma ${r.failed.length} file non sono stati copiati: ${r.failed.join(", ")}`
                : `Copiata in «${r.name}»: ${plural(r.files, "file", "file")} sul tuo Drive`,
              r.failed.length ? "error" : undefined,
            );
            await loadFolders();
            loadStorage();
            select(r.id);
          }}
        />
      )}

      {moveFiles &&
        (() => {
          const owners = new Set(moveFiles.map((x) => x.owner.id));
          const folders = new Set(moveFiles.map((x) => x.folderId));
          const one = moveFiles.length === 1 ? moveFiles[0] : null;
          return (
            <FolderPickerDialog
              title={one ? `Sposta «${one.title}»` : `Sposta ${plural(moveFiles.length, "file", "file")}`}
              intro={
                owners.size > 1 ? (
                  "I file scelti stanno su Drive diversi: si possono spostare insieme solo file dello stesso proprietario."
                ) : moveFiles.length === 0 ? (
                  "Nessuno dei file scelti si può spostare: lo può fare solo chi li ha caricati o il proprietario della cartella."
                ) : (
                  <>
                    Si spostano anche su Google Drive, tra le cartelle dello stesso Drive. Se un file esce da una cartella condivisa, sparisce dai piani dei colleghi che non
                    lo vedono più.
                  </>
                )
              }
              all={all}
              ownerId={owners.size === 1 ? [...owners][0] : null}
              current={folders.size === 1 ? [...folders][0] : "—"}
              onClose={() => setMoveFiles(null)}
              onPick={async (to) => {
                if (!to) return;
                await moveFilesTo(moveFiles, to, label(to.id));
                setMoveFiles(null);
              }}
            />
          );
        })()}

      {movingFolder && (
        <FolderPickerDialog
          title={`Sposta «${movingFolder.name}»`}
          intro={
            <>
              La cartella si sposta con tutto il contenuto, anche su Google Drive, tra le cartelle dello stesso Drive.
              {!movingFolder.parentId && movingFolder.members.length > 0 && " È condivisa: prima di metterla dentro un'altra cartella togli la condivisione."}
            </>
          }
          all={all}
          ownerId={movingFolder.owner.id}
          exclude={subtreeIds(all, movingFolder.id)}
          current={movingFolder.parentId}
          rootLabel={movingFolder.role === "owner" ? "Le mie cartelle (cartella principale)" : undefined}
          onClose={() => setMovingFolder(null)}
          onPick={async (to) => {
            await moveFolderTo(movingFolder, to, label(to?.id ?? null));
            setMovingFolder(null);
          }}
        />
      )}

      {bulkTags && (
        <BulkTagDialog
          files={bulkTags}
          onClose={() => setBulkTags(null)}
          onSaved={(n) => {
            setBulkTags(null);
            toast(n ? `Etichette aggiornate su ${plural(n, "file", "file")}` : "Nessun cambiamento");
            loadItems();
          }}
        />
      )}

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
