"use client";

import { ExternalLink, FileText, Folder, FolderPlus, HardDrive, Link2, Pencil, Search, Share2, Trash2, TriangleAlert, Upload, Users, X } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { FileIcon, fileSize, uploadExercises } from "@/components/PlanExercises";
import { ShareDialog } from "@/components/ShareDialog";
import { Button, buttonClass, cx, Dialog, EmptyState, ErrorNote, Field, IconButton, Input, Loading, useToast } from "@/components/ui";
import { api, errorMessage } from "@/lib/api";
import { EXERCISE_ACCEPT } from "@/lib/file-types";
import { humanDate } from "@/lib/plan-utils";
import type { ExerciseDTO, FoldersDTO, MaterialFolderDTO, PlanSummary, UserDTO } from "@/lib/types";

const LAST_FOLDER = "pianostudio:cartella-esercizi";

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

function FolderButton({ f, selected, onSelect }: { f: MaterialFolderDTO; selected: boolean; onSelect: () => void }) {
  const shared = f.members.length > 0 || f.role === "member";
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-current={selected ? "true" : undefined}
      className={cx(
        "flex w-full items-center gap-2 rounded-md px-2 py-2 text-left transition-colors",
        selected ? "bg-accent-soft font-medium text-accent" : "hover:bg-sunken",
      )}
    >
      <Folder className="size-4 shrink-0" aria-hidden />
      <span className="min-w-0 flex-1">
        <span className="block truncate">{f.name}</span>
        {f.role === "member" && <span className="block truncate text-xs font-normal text-muted">di {f.owner.name}</span>}
      </span>
      {shared && <Users className="size-3.5 shrink-0 text-muted" aria-label="condivisa" />}
      <span className="tabular text-xs text-muted">{f.fileCount || ""}</span>
    </button>
  );
}

export default function EserciziPage() {
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [me, setMe] = useState<UserDTO | null>(null);
  const [data, setData] = useState<FoldersDTO | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [items, setItems] = useState<ExerciseDTO[] | null>(null);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [naming, setNaming] = useState<{ id?: string; name: string } | null>(null);
  const [nameError, setNameError] = useState("");
  const [sharing, setSharing] = useState(false);
  const [editing, setEditing] = useState<ExerciseDTO | null>(null);
  const [draft, setDraft] = useState({ title: "", note: "" });
  const [editError, setEditError] = useState("");
  const [linking, setLinking] = useState<ExerciseDTO | null>(null);

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
  useEffect(() => {
    loadFolders();
    api.get<UserDTO>("/api/auth/me").then(setMe, () => {});
  }, [loadFolders]);

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
  };

  function select(id: string) {
    setSelected(id);
    setQuery("");
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
        const created = await api.post<{ id: string }>("/api/material-folders", { name: naming.name });
        select(created.id);
      }
      setNaming(null);
      loadFolders();
    } catch (err) {
      setNameError(errorMessage(err));
    }
  }

  async function deleteFolder(f: MaterialFolderDTO) {
    const who = f.members.length ? ` I ${f.members.length} colleghi con cui è condivisa non la vedranno più.` : "";
    if (!confirm(`Eliminare la cartella «${f.name}» e i suoi ${f.fileCount} file? Su Google Drive vanno nel cestino (recuperabili per 30 giorni).${who}`)) return;
    try {
      await api.del(`/api/material-folders/${f.id}`);
      setSelected(null);
      loadFolders();
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

  const folder = data.folders.find((f) => f.id === selected) ?? null;
  const mine = data.folders.filter((f) => f.role === "owner");
  const shared = data.folders.filter((f) => f.role === "member");
  const authorize = `/api/auth/google?drive=1&next=${encodeURIComponent("/esercizi")}`;

  return (
    <div>
      <header className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-[26px] leading-tight font-semibold">Esercizi</h1>
          <p className="mt-0.5 text-muted">I file stanno sul tuo Google Drive, nella cartella «PianoStudio». Le cartelle si possono condividere con i colleghi.</p>
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

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[250px_minmax(0,1fr)]">
        <nav aria-label="Cartelle di esercizi" className="self-start rounded-xl border border-line bg-surface p-2">
          <p className="px-2 pt-1 pb-1.5 text-xs font-semibold tracking-wide text-muted uppercase">Le mie cartelle</p>
          <ul>
            {mine.map((f) => (
              <li key={f.id}>
                <FolderButton f={f} selected={!q && f.id === selected} onSelect={() => select(f.id)} />
              </li>
            ))}
          </ul>
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
              <ul>
                {shared.map((f) => (
                  <li key={f.id}>
                    <FolderButton f={f} selected={!q && f.id === selected} onSelect={() => select(f.id)} />
                  </li>
                ))}
              </ul>
            </>
          )}
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
            folder && (
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <h2 className="truncate font-display text-xl font-semibold">{folder.name}</h2>
                  <p className="text-[13px] text-muted">
                    {folder.role === "member"
                      ? `Condivisa da ${folder.owner.name}`
                      : folder.members.length
                        ? `Condivisa con ${folder.members.map((m) => m.name).join(", ")}`
                        : "Solo tua"}
                    {folder.role === "owner" &&
                      folder.invites.length > 0 &&
                      ` · ${folder.invites.length} ${folder.invites.length === 1 ? "invito" : "inviti"} in attesa`}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <a href={folder.driveUrl} target="_blank" rel="noopener noreferrer" className={buttonClass("ghost", "sm")}>
                    <ExternalLink className="size-3.5" /> Apri in Drive
                  </a>
                  {!folder.isDefault && (
                    <Button size="sm" variant="ghost" onClick={() => setSharing(true)}>
                      <Share2 className="size-3.5" /> {folder.role === "owner" ? "Condividi" : "Chi ha accesso"}
                    </Button>
                  )}
                  {folder.role === "owner" && !folder.isDefault && (
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
          {folder?.isDefault && !q && (
            <p className="mb-3 text-[13px] text-muted">
              Per condividere esercizi con un collega crea una cartella con «Nuova cartella» e usa «Condividi».
            </p>
          )}

          {!items ? (
            <Loading />
          ) : items.length === 0 ? (
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
                        q && x.folderName ? `in «${x.folderName}»` : null,
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

      <Dialog open={!!naming} onClose={() => setNaming(null)} title={naming?.id ? "Rinomina cartella" : "Nuova cartella"}>
        {naming && (
          <form onSubmit={saveFolder} className="space-y-4">
            <Field label="Nome" hint={naming.id ? "Il nome cambia anche su Google Drive." : "es. Esercizi prima media. La cartella nasce sul tuo Google Drive."}>
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
          folder={folder}
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
