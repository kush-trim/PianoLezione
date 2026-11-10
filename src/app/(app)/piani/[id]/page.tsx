"use client";

import {
  ArrowLeft,
  Check,
  Copy,
  FileDown,
  History,
  LayoutTemplate,
  Loader2,
  Plus,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PhaseTable } from "@/components/PhaseTable";
import { TimeBar } from "@/components/TimeBar";
import { AutoTextarea, Button, cx, EmptyState, Field, IconButton, Input, inputClass, Loading, useToast } from "@/components/ui";
import { VersionsDialog } from "@/components/VersionsDialog";
import { api, errorMessage, HttpError } from "@/lib/api";
import { swatch } from "@/lib/colors";
import { buildTree, flattenTree } from "@/lib/folders";
import { computeAllegati, humanDate, weekdayOf, WEEKDAYS } from "@/lib/plan-utils";
import { computeSchedule, planIntervals, redistribute, toMin } from "@/lib/schedule";
import type { FolderDTO, PhaseTemplateDTO, PlanDTO, SlotDTO } from "@/lib/types";

type SaveStatus = "saved" | "dirty" | "saving" | "error";

const AUTOSAVE_MS = 700;

/** Solo i campi modificabili: è il corpo della PUT. */
function payload(p: PlanDTO) {
  return {
    folderId: p.folderId,
    title: p.title,
    date: p.date,
    manualStart: p.manualStart,
    manualDuration: p.manualDuration,
    prerequisiti: p.prerequisiti,
    obiettivoInsegnamento: p.obiettivoInsegnamento,
    traguardo: p.traguardo,
    obiettivoApprendimento: p.obiettivoApprendimento,
    verifica: p.verifica,
    allegati: p.allegati,
    allegatiAuto: p.allegatiAuto,
    sezioniExtra: p.sezioniExtra,
    slotIds: p.slotIds,
    phases: p.phases,
  };
}

function TextSection({
  label,
  hint,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="block font-semibold">{label}</span>
      {hint && <span className="block text-[13px] text-muted">{hint}</span>}
      <AutoTextarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        minRows={2}
        className="mt-1.5 w-full resize-none rounded-md border border-line-strong bg-surface px-3 py-2 leading-relaxed placeholder:text-muted/60"
      />
    </label>
  );
}

function SaveBadge({ status, onRetry }: { status: SaveStatus; onRetry: () => void }) {
  if (status === "error") {
    return (
      <button type="button" onClick={onRetry} className="flex items-center gap-1.5 text-[13px] font-medium text-danger hover:underline">
        <TriangleAlert className="size-4" /> Non salvato. Riprova
      </button>
    );
  }
  return (
    <span className="flex items-center gap-1.5 text-[13px] text-muted" role="status">
      {status === "saved" ? <Check className="size-4 text-ok" /> : <Loader2 className="size-4 animate-spin" />}
      {status === "saved" ? "Salvato" : "Salvataggio…"}
    </span>
  );
}

export default function PlanEditorPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const toast = useToast();

  const [plan, setPlan] = useState<PlanDTO | null>(null);
  const [missing, setMissing] = useState(false);
  const [allSlots, setAllSlots] = useState<SlotDTO[] | null>(null);
  const [folders, setFolders] = useState<FolderDTO[]>([]);
  const [templates, setTemplates] = useState<PhaseTemplateDTO[]>([]);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [status, setStatus] = useState<SaveStatus>("saved");
  const [versionsOpen, setVersionsOpen] = useState(false);
  const [busy, setBusy] = useState("");

  // --- Caricamento ---
  useEffect(() => {
    let stale = false;
    api.get<PlanDTO>(`/api/plans/${id}`).then(
      (p) => !stale && setPlan(p),
      (e) => {
        if (stale) return;
        if (e instanceof HttpError && e.status === 404) setMissing(true);
        else toast(errorMessage(e), "error");
      },
    );
    api.get<SlotDTO[]>("/api/timetable").then((s) => !stale && setAllSlots(s), () => {});
    api.get<FolderDTO[]>("/api/folders").then((f) => !stale && setFolders(f), () => {});
    api.get<PhaseTemplateDTO[]>("/api/phase-templates").then((t) => !stale && setTemplates(t), () => {});
    api.get<string[]>("/api/materials").then((m) => !stale && setSuggestions(m), () => {});
    return () => {
      stale = true;
    };
  }, [id, toast]);

  // --- Salvataggio automatico ---
  const planRef = useRef<PlanDTO | null>(null);
  const dirtyRef = useRef(false);
  const savingRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Il salvataggio si riprogramma da solo: passa da un ref per potersi richiamare.
  const saveRef = useRef<() => Promise<boolean>>(async () => true);
  const scheduleSave = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => saveRef.current(), AUTOSAVE_MS);
  }, []);
  useEffect(() => {
    planRef.current = plan;
  }, [plan]);

  const save = useCallback(async (): Promise<boolean> => {
    if (timerRef.current) clearTimeout(timerRef.current);
    // Un salvataggio è già in corso: al termine ripartirà da solo se serve.
    if (savingRef.current) return false;
    const p = planRef.current;
    if (!p || !dirtyRef.current) return true;
    savingRef.current = true;
    dirtyRef.current = false;
    setStatus("saving");
    let ok = true;
    try {
      await api.put(`/api/plans/${p.id}`, payload(p));
    } catch {
      ok = false;
      dirtyRef.current = true;
    }
    savingRef.current = false;
    if (!ok) setStatus("error");
    else if (dirtyRef.current) scheduleSave();
    else setStatus("saved");
    return ok && !dirtyRef.current;
  }, [scheduleSave]);
  useEffect(() => {
    saveRef.current = save;
  }, [save]);

  /** Aspetta che tutte le modifiche siano sul server (prima di esportare, duplicare…). */
  const flush = useCallback(async () => {
    for (let i = 0; i < 40; i++) {
      if (await save()) return true;
      if (!savingRef.current && !dirtyRef.current) return true;
      await new Promise((r) => setTimeout(r, 150));
    }
    return false;
  }, [save]);

  const update = useCallback(
    (patch: Partial<PlanDTO>) => {
      setPlan((p) => (p ? { ...p, ...patch } : p));
      dirtyRef.current = true;
      setStatus((s) => (s === "saving" ? s : "dirty"));
      scheduleSave();
    },
    [scheduleSave],
  );

  // Uscendo dalla pagina le modifiche in sospeso vengono inviate comunque.
  useEffect(() => {
    const sendPending = () => {
      const p = planRef.current;
      if (!p || !dirtyRef.current) return;
      dirtyRef.current = false;
      fetch(`/api/plans/${p.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload(p)),
        keepalive: true,
      }).catch(() => {});
    };
    window.addEventListener("pagehide", sendPending);
    return () => {
      window.removeEventListener("pagehide", sendPending);
      if (timerRef.current) clearTimeout(timerRef.current);
      sendPending();
    };
  }, []);

  // --- Dati derivati ---
  const slots = useMemo(() => {
    if (!plan) return [];
    const source = allSlots ?? plan.slots;
    return source
      .filter((s) => plan.slotIds.includes(s.id))
      .sort((a, b) => toMin(a.startTime) - toMin(b.startTime));
  }, [plan, allSlots]);

  const schedule = useMemo(
    () =>
      computeSchedule(
        planIntervals({ slots, manualStart: plan?.manualStart ?? null, manualDuration: plan?.manualDuration ?? null }),
        (plan?.phases ?? []).map((p) => p.durationMin),
      ),
    [plan, slots],
  );

  const folderOptions = useMemo(() => flattenTree(buildTree(folders)), [folders]);

  if (missing) {
    return (
      <EmptyState
        title="Piano non trovato"
        action={
          <Link href="/cartelle">
            <Button>Vai alle cartelle</Button>
          </Link>
        }
      >
        Potrebbe essere stato eliminato.
      </EmptyState>
    );
  }
  if (!plan) return <Loading />;

  const daySlots = plan.date && allSlots ? allSlots.filter((s) => s.weekday === weekdayOf(plan.date!)) : [];
  const allegatiAuto = computeAllegati(plan.phases);

  function setDate(date: string | null) {
    // Cambiando giorno della settimana le lezioni collegate non valgono più.
    const keep = date && allSlots ? allSlots.filter((s) => s.weekday === weekdayOf(date)).map((s) => s.id) : [];
    update({ date, slotIds: plan!.slotIds.filter((sid) => keep.includes(sid)) });
  }

  function toggleSlot(slotId: string) {
    const has = plan!.slotIds.includes(slotId);
    update({ slotIds: has ? plan!.slotIds.filter((x) => x !== slotId) : [...plan!.slotIds, slotId] });
  }

  function doRedistribute() {
    if (schedule.available === null) return;
    const durations = redistribute(plan!.phases.map((p) => p.durationMin), schedule.available);
    update({ phases: plan!.phases.map((p, i) => ({ ...p, durationMin: durations[i] })) });
  }

  async function run(name: string, fn: () => Promise<void>) {
    setBusy(name);
    try {
      if (!(await flush())) throw new Error("Non riesco a salvare le ultime modifiche. Riprova tra poco.");
      await fn();
    } catch (e) {
      toast(errorMessage(e), "error");
    } finally {
      setBusy("");
    }
  }

  const exportPdf = () => run("pdf", async () => void window.open(`/api/plans/${plan.id}/pdf`, "_blank"));

  const duplicate = () =>
    run("duplicate", async () => {
      const copy = await api.post<PlanDTO>(`/api/plans/${plan.id}/duplicate`, {});
      toast("Piano duplicato");
      router.push(`/piani/${copy.id}`);
    });

  const saveAsTemplate = () =>
    run("template", async () => {
      await api.post(`/api/plans/${plan.id}/duplicate`, { asTemplate: true });
      toast("Salvato tra i modelli");
    });

  const useTemplate = () =>
    run("use", async () => {
      const created = await api.post<PlanDTO>("/api/plans", { fromTemplateId: plan.id });
      router.push(`/piani/${created.id}`);
    });

  async function remove() {
    if (!confirm(`Eliminare ${plan!.isTemplate ? "il modello" : "il piano"} "${plan!.title || "Senza titolo"}"? Non si può annullare.`)) return;
    dirtyRef.current = false;
    try {
      await api.del(`/api/plans/${plan!.id}`);
      router.push(plan!.isTemplate ? "/modelli" : "/cartelle");
    } catch (e) {
      toast(errorMessage(e), "error");
    }
  }

  return (
    <div className="mx-auto max-w-[1280px]">
      {/* Barra delle azioni */}
      <div className="sticky top-0 z-10 -mx-4 mb-5 flex flex-wrap items-center gap-2 border-b border-line bg-paper/95 px-4 py-2 backdrop-blur md:-mx-8 md:-mt-7 md:px-8 md:pt-3 max-md:top-[49px]">
        <IconButton label="Indietro" onClick={() => router.back()}>
          <ArrowLeft className="size-4" />
        </IconButton>
        <SaveBadge status={status} onRetry={save} />
        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          <Button size="sm" variant="ghost" onClick={() => run("versions", async () => setVersionsOpen(true))}>
            <History className="size-3.5" /> Versioni
          </Button>
          <Button size="sm" variant="ghost" onClick={duplicate} loading={busy === "duplicate"}>
            <Copy className="size-3.5" /> Duplica
          </Button>
          {!plan.isTemplate && (
            <Button size="sm" variant="ghost" onClick={saveAsTemplate} loading={busy === "template"}>
              <LayoutTemplate className="size-3.5" /> Salva come modello
            </Button>
          )}
          <Button size="sm" variant="danger" onClick={remove}>
            <Trash2 className="size-3.5" /> Elimina
          </Button>
          <Button size="sm" variant="primary" onClick={exportPdf} loading={busy === "pdf"}>
            <FileDown className="size-3.5" /> Esporta PDF
          </Button>
        </div>
      </div>

      {plan.isTemplate && (
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-accent-soft px-4 py-3">
          <p>
            <strong>Questo è un modello.</strong> Le modifiche valgono per i piani che creerai da qui in poi.
          </p>
          <Button variant="primary" onClick={useTemplate} loading={busy === "use"}>
            <Plus className="size-4" /> Crea un piano da questo modello
          </Button>
        </div>
      )}

      {/* Titolo */}
      <p className="text-[13px] font-medium tracking-wide text-muted uppercase">Alcuni aspetti del piano lezione</p>
      <input
        value={plan.title}
        onChange={(e) => update({ title: e.target.value })}
        placeholder="Titolo della lezione (es. il banco)"
        aria-label="Titolo della lezione"
        className="mt-0.5 mb-5 w-full rounded-md bg-transparent py-1 font-display text-[30px] leading-tight font-semibold placeholder:text-muted/50 hover:bg-sunken/60 focus:bg-surface focus:px-2"
      />

      {/* Quando e dove */}
      {!plan.isTemplate && (
        <section className="mb-5 grid gap-4 rounded-xl border border-line bg-surface p-4 lg:grid-cols-[180px_minmax(0,1fr)_220px]">
          <Field label="Data">
            <Input type="date" value={plan.date ?? ""} onChange={(e) => setDate(e.target.value || null)} />
          </Field>

          <div>
            <span className="mb-1 block text-[13px] font-medium">Lezione</span>
            {!plan.date ? (
              <p className="py-2 text-muted">Scegli una data per collegare il piano a una lezione del tuo orario.</p>
            ) : daySlots.length === 0 ? (
              <p className="py-2 text-muted">
                Nessuna lezione in orario di {WEEKDAYS[weekdayOf(plan.date) - 1].toLowerCase()}.{" "}
                <Link href="/orario" className="font-medium text-accent hover:underline">
                  Modifica l&apos;orario
                </Link>
              </p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {daySlots.map((s) => {
                  const on = plan.slotIds.includes(s.id);
                  const c = swatch(s.color);
                  return (
                    <button
                      key={s.id}
                      type="button"
                      role="checkbox"
                      aria-checked={on}
                      onClick={() => toggleSlot(s.id)}
                      className={cx(
                        "tabular flex h-9 items-center gap-2 rounded-md border px-2.5 text-[13px] transition-colors",
                        !on && "border-line-strong bg-surface text-muted hover:text-ink",
                      )}
                      style={on ? { background: c.bg, borderColor: c.solid, color: c.text } : undefined}
                    >
                      <span
                        className="flex size-4 items-center justify-center rounded border"
                        style={{ borderColor: on ? c.solid : "var(--line-strong)", background: on ? c.solid : "transparent" }}
                      >
                        {on && <Check className="size-3 text-white" />}
                      </span>
                      <span className="font-medium">
                        {s.startTime}–{s.endTime}
                      </span>
                      {s.subject}
                      {s.className && ` · ${s.className}`}
                    </button>
                  );
                })}
              </div>
            )}
            {plan.slotIds.length === 0 && (
              <div className="mt-3 flex flex-wrap items-end gap-3 border-t border-line pt-3">
                <Field label="Oppure: ora di inizio" className="w-36">
                  <Input type="time" value={plan.manualStart ?? ""} onChange={(e) => update({ manualStart: e.target.value || null })} />
                </Field>
                <Field label="Durata (min)" className="w-28">
                  <Input
                    type="number"
                    min={1}
                    max={600}
                    value={plan.manualDuration ?? ""}
                    onChange={(e) => {
                      const n = Math.round(Number(e.target.value));
                      update({ manualDuration: n >= 1 && n <= 600 ? n : null });
                    }}
                    placeholder="es. 45"
                  />
                </Field>
              </div>
            )}
            {plan.date && slots.length > 0 && (
              <p className="mt-2 text-[13px] text-muted">
                {humanDate(plan.date, { weekday: true })} · {slots.map((s) => `${s.startTime}–${s.endTime}`).join(", ")}
              </p>
            )}
          </div>

          <Field label="Cartella">
            <select className={inputClass} value={plan.folderId ?? ""} onChange={(e) => update({ folderId: e.target.value || null })}>
              <option value="">Nessuna cartella</option>
              {folderOptions.map((f) => (
                <option key={f.id} value={f.id}>
                  {"  ".repeat(f.depth)}
                  {f.name}
                </option>
              ))}
            </select>
          </Field>
        </section>
      )}

      <div className="space-y-5">
        <TextSection label="Prerequisiti degli allievi" value={plan.prerequisiti} onChange={(v) => update({ prerequisiti: v })} />
        <TextSection
          label="Obiettivo d’insegnamento"
          value={plan.obiettivoInsegnamento}
          onChange={(v) => update({ obiettivoInsegnamento: v })}
          placeholder="- Il docente…"
        />
        <TextSection
          label="Traguardo di apprendimento specifico al quale principalmente si riferisce la lezione"
          value={plan.traguardo}
          onChange={(v) => update({ traguardo: v })}
        />
        <TextSection
          label="Obiettivo d’apprendimento (disciplinare / trasversale)"
          value={plan.obiettivoApprendimento}
          onChange={(v) => update({ obiettivoApprendimento: v })}
          placeholder="- L’allievo…"
        />

        <section>
          <h2 className="mb-2 font-semibold">Articolazione operativa</h2>
          <div className="mb-3">
            <TimeBar phases={plan.phases} schedule={schedule} onRedistribute={doRedistribute} />
          </div>
          <PhaseTable
            phases={plan.phases}
            schedule={schedule}
            templates={templates}
            suggestions={suggestions}
            onChange={(phases) => update({ phases })}
          />
        </section>

        <TextSection
          label="Verifica dell’obiettivo"
          hint="Quali azioni dell’allievo mi permettono di capire se l’obiettivo di apprendimento è stato raggiunto?"
          value={plan.verifica}
          onChange={(v) => update({ verifica: v })}
          placeholder="L’allievo…"
        />

        <section>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-semibold">Ev. Allegati</h2>
            <Button
              size="sm"
              variant="ghost"
              onClick={() =>
                plan.allegatiAuto
                  ? update({ allegatiAuto: false, allegati: allegatiAuto })
                  : update({ allegatiAuto: true })
              }
            >
              {plan.allegatiAuto ? "Scrivi a mano" : "Rigenera dai materiali"}
            </Button>
          </div>
          {plan.allegatiAuto ? (
            <div className="mt-1.5 rounded-md border border-dashed border-line-strong px-3 py-2 leading-relaxed">
              {allegatiAuto ? (
                <p className="whitespace-pre-line">{allegatiAuto}</p>
              ) : (
                <p className="text-muted">Si compila da solo con i materiali indicati nella tabella.</p>
              )}
            </div>
          ) : (
            <AutoTextarea
              value={plan.allegati}
              onChange={(e) => update({ allegati: e.target.value })}
              minRows={2}
              aria-label="Allegati"
              className="mt-1.5 w-full resize-none rounded-md border border-line-strong bg-surface px-3 py-2 leading-relaxed"
            />
          )}
        </section>

        {/* Sezioni personalizzate */}
        {plan.sezioniExtra.map((sez) => {
          const patch = (p: Partial<typeof sez>) =>
            update({ sezioniExtra: plan.sezioniExtra.map((x) => (x.id === sez.id ? { ...x, ...p } : x)) });
          return (
            <section key={sez.id}>
              <div className="flex items-center gap-2">
                <input
                  value={sez.titolo}
                  onChange={(e) => patch({ titolo: e.target.value })}
                  placeholder="Titolo della sezione"
                  aria-label="Titolo della sezione"
                  className="min-w-0 flex-1 rounded-md bg-transparent py-1 font-semibold hover:bg-sunken/60 focus:bg-surface focus:px-2"
                />
                <IconButton
                  label="Elimina sezione"
                  className="hover:bg-danger-soft hover:text-danger"
                  onClick={() => update({ sezioniExtra: plan.sezioniExtra.filter((x) => x.id !== sez.id) })}
                >
                  <Trash2 className="size-4" />
                </IconButton>
              </div>
              <AutoTextarea
                value={sez.testo}
                onChange={(e) => patch({ testo: e.target.value })}
                minRows={2}
                aria-label={sez.titolo || "Testo della sezione"}
                className="mt-1 w-full resize-none rounded-md border border-line-strong bg-surface px-3 py-2 leading-relaxed"
              />
            </section>
          );
        })}

        <Button
          onClick={() =>
            update({ sezioniExtra: [...plan.sezioniExtra, { id: crypto.randomUUID(), titolo: "", testo: "" }] })
          }
        >
          <Plus className="size-4" /> Aggiungi sezione
        </Button>
      </div>

      <VersionsDialog
        planId={versionsOpen ? plan.id : null}
        onClose={() => setVersionsOpen(false)}
        onRestored={(restored) => {
          dirtyRef.current = false;
          setPlan(restored);
          setStatus("saved");
          setVersionsOpen(false);
          toast("Versione ripristinata");
        }}
      />
    </div>
  );
}
