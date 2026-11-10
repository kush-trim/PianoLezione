"use client";

import { ArrowLeft, ArrowRight, Check, Plus, Trash2, Wand2 } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ObjectiveBuilder } from "@/components/ObjectiveBuilder";
import { newPhase } from "@/components/PhaseTable";
import { AutoTextarea, Button, cx, ErrorNote, Field, IconButton, Input, inputClass, Loading, PageHeader } from "@/components/ui";
import { api, errorMessage } from "@/lib/api";
import { swatch } from "@/lib/colors";
import { buildTree, flattenTree } from "@/lib/folders";
import { humanDate, objectivesText, WEEKDAYS, weekdayOf } from "@/lib/plan-utils";
import { redistribute, toMin } from "@/lib/schedule";
import type { FolderDTO, Obiettivo, Occurrence, PhaseDTO, PhaseTemplateDTO, PlanDTO, PlanSummary, SettingsDTO, VerbDTO } from "@/lib/types";

const STEPS = ["Lezione", "Punto di partenza", "Obiettivi", "Fasi", "Verifica"];

/** Struttura di partenza per una lezione, adattata alla durata. */
function proposePhases(available: number): PhaseDTO[] {
  const base: [string, string, number][] =
    available <= 50
      ? [
          ["Introduzione", "frontale", 5],
          ["Attività", "a coppie", 20],
          ["Messa in comune", "presentazione dialogata", 10],
          ["Sintesi", "dialogata", 5],
          ["Conclusione", "dialogata", 5],
        ]
      : [
          ["Introduzione", "frontale", 5],
          ["Attività", "a coppie", 20],
          ["Messa in comune", "presentazione dialogata", 10],
          ["Esercitazione", "a coppie", 20],
          ["Sintesi", "dialogata", 5],
          ["Esercitazione", "a coppie", 20],
          ["Conclusione", "dialogata", 5],
        ];
  const durations = redistribute(base.map((b) => b[2]), available);
  return base.map(([name, modality], i) => newPhase({ name, modality, durationMin: durations[i] }));
}

const textareaClass = "w-full resize-none rounded-md border border-line-strong bg-surface px-3 py-2 leading-relaxed placeholder:text-muted/60";

export default function NuovoPianoPage() {
  const router = useRouter();
  const params = useSearchParams();

  const [step, setStep] = useState(0);
  const [settings, setSettings] = useState<SettingsDTO | null>(null);
  const [verbs, setVerbs] = useState<VerbDTO[]>([]);
  const [folders, setFolders] = useState<FolderDTO[]>([]);
  const [phaseTemplates, setPhaseTemplates] = useState<PhaseTemplateDTO[]>([]);
  const [planTemplates, setPlanTemplates] = useState<PlanSummary[]>([]);
  const [lessons, setLessons] = useState<Occurrence[] | null>(null);

  const [title, setTitle] = useState("");
  const [date, setDate] = useState(params.get("date") ?? "");
  const [slotIds, setSlotIds] = useState<string[]>(() => params.get("slots")?.split(",").filter(Boolean) ?? []);
  const [folderId, setFolderId] = useState(params.get("folderId") ?? "");
  const [duration, setDuration] = useState<number | null>(null);
  const [manualStart, setManualStart] = useState("");
  const [prerequisiti, setPrerequisiti] = useState("");
  const [traguardo, setTraguardo] = useState("");
  const [obIns, setObIns] = useState<Obiettivo[]>([]);
  const [obApp, setObApp] = useState<Obiettivo[]>([]);
  const [phases, setPhases] = useState<PhaseDTO[] | null>(null);
  const [verifica, setVerifica] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get<SettingsDTO>("/api/settings").then(setSettings, (e) => setError(errorMessage(e)));
    api.get<VerbDTO[]>("/api/verbs").then(setVerbs, () => {});
    api.get<FolderDTO[]>("/api/folders").then(setFolders, () => {});
    api.get<PhaseTemplateDTO[]>("/api/phase-templates").then(setPhaseTemplates, () => {});
    api.get<PlanSummary[]>("/api/plans?templates=1").then(setPlanTemplates, () => {});
  }, []);

  useEffect(() => {
    if (!date) return;
    let stale = false;
    api.get<Occurrence[]>(`/api/timetable?date=${date}`).then((o) => !stale && setLessons(o), () => {});
    return () => {
      stale = true;
    };
  }, [date]);

  const folderOptions = useMemo(() => flattenTree(buildTree(folders)), [folders]);

  if (!settings) return error ? <ErrorNote>{error}</ErrorNote> : <Loading />;

  const lessonMinutes = settings.lessonMinutes;
  const dayLessons = date ? (lessons ?? []) : [];
  const chosen = dayLessons.filter((o) => slotIds.includes(o.slot.id));
  const declared = duration ?? settings.defaultHours * lessonMinutes;
  // Con una lezione dell'orario la durata è quella della lezione; altrimenti quella dichiarata.
  const available = chosen.length ? chosen.reduce((s, o) => s + toMin(o.endTime) - toMin(o.startTime), 0) : declared;
  const total = (phases ?? []).reduce((s, p) => s + p.durationMin, 0);

  function changeDate(value: string) {
    const sameWeekday = !!value && !!date && weekdayOf(value) === weekdayOf(date);
    setDate(value);
    setLessons(null);
    if (!sameWeekday) setSlotIds([]);
  }

  function goTo(next: number) {
    // Arrivando alle fasi per la prima volta si parte da una struttura adatta alla durata.
    if (next === 3 && phases === null) setPhases(proposePhases(available));
    setStep(next);
  }

  async function copyFromTemplate(id: string) {
    if (!id) return;
    try {
      const template = await api.get<PlanDTO>(`/api/plans/${id}`);
      setPhases(template.phases.map((p) => newPhase({ ...p, id: crypto.randomUUID() })));
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  const patchPhase = (id: string, p: Partial<PhaseDTO>) => setPhases((list) => (list ?? []).map((x) => (x.id === id ? { ...x, ...p } : x)));

  async function create() {
    setSaving(true);
    setError("");
    try {
      const linked = chosen.map((o) => o.slot.id);
      const plan = await api.post<PlanDTO>("/api/plans", {
        title,
        date: date || null,
        slotIds: linked,
        folderId: folderId || null,
        manualStart: linked.length ? null : manualStart || null,
        manualDuration: linked.length ? null : declared,
      });
      await api.put(`/api/plans/${plan.id}`, {
        prerequisiti,
        traguardo,
        verifica,
        obiettiviInsegnamento: obIns,
        obiettiviApprendimento: obApp,
        obiettivoInsegnamento: objectivesText("insegnamento", obIns),
        obiettivoApprendimento: objectivesText("apprendimento", obApp),
        phases: phases ?? proposePhases(available),
      });
      router.replace(`/piani/${plan.id}`);
    } catch (e) {
      setError(errorMessage(e));
      setSaving(false);
    }
  }

  const incomplete = (items: Obiettivo[]) => items.some((o) => !o.verbo || !o.testo.trim());

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Nuovo piano lezione" subtitle="Cinque passi. Tutto si può modificare anche dopo." />

      {/* Passi */}
      <ol className="mb-5 flex gap-1 overflow-x-auto">
        {STEPS.map((label, i) => (
          <li key={label} className="min-w-fit flex-1">
            <button
              type="button"
              onClick={() => goTo(i)}
              aria-current={step === i ? "step" : undefined}
              className={cx(
                "flex w-full items-center gap-2 border-t-2 px-1 pt-2 text-left text-[13px] font-medium transition-colors",
                step === i ? "border-accent text-accent" : i < step ? "border-accent/40 text-ink" : "border-line text-muted hover:text-ink",
              )}
            >
              <span
                className={cx(
                  "tabular flex size-5 shrink-0 items-center justify-center rounded-full text-xs",
                  step === i ? "bg-accent text-white" : i < step ? "bg-accent-soft text-accent" : "bg-sunken",
                )}
              >
                {i < step ? <Check className="size-3" /> : i + 1}
              </span>
              <span className="whitespace-nowrap">{label}</span>
            </button>
          </li>
        ))}
      </ol>

      <div className="rounded-xl border border-line bg-surface p-5">
        {step === 0 && (
          <div className="space-y-5">
            <Field label="Titolo della lezione" hint="Compare nell’intestazione: «Alcuni aspetti del piano lezione (titolo)».">
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="es. il banco" autoFocus />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Data">
                <Input type="date" value={date} onChange={(e) => changeDate(e.target.value)} />
              </Field>
              <Field label="Cartella">
                <select className={inputClass} value={folderId} onChange={(e) => setFolderId(e.target.value)}>
                  <option value="">Nessuna cartella</option>
                  {folderOptions.map((f) => (
                    <option key={f.id} value={f.id}>
                      {"  ".repeat(f.depth)}
                      {f.name}
                    </option>
                  ))}
                </select>
              </Field>
            </div>

            <div>
              <span className="mb-1 block text-[13px] font-medium">Lezione dell’orario</span>
              {!date ? (
                <p className="text-muted">Scegli una data per vedere le lezioni di quel giorno.</p>
              ) : lessons === null ? (
                <p className="text-muted">Carico le lezioni…</p>
              ) : dayLessons.length === 0 ? (
                <p className="text-muted">Nessuna lezione in orario di {WEEKDAYS[weekdayOf(date) - 1].toLowerCase()}: indica la durata qui sotto.</p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {dayLessons.map((o) => {
                    const on = slotIds.includes(o.slot.id);
                    const c = swatch(o.slot.color);
                    return (
                      <button
                        key={o.slot.id}
                        type="button"
                        role="checkbox"
                        aria-checked={on}
                        disabled={o.cancelled}
                        onClick={() => setSlotIds(on ? slotIds.filter((x) => x !== o.slot.id) : [...slotIds, o.slot.id])}
                        className={cx(
                          "tabular flex h-9 items-center gap-2 rounded-md border px-2.5 text-[13px] disabled:opacity-50",
                          !on && "border-line-strong text-muted hover:text-ink",
                        )}
                        style={on ? { background: c.bg, borderColor: c.solid, color: c.text } : undefined}
                      >
                        <span className="font-medium">
                          {o.startTime}–{o.endTime}
                        </span>
                        {o.slot.subject}
                        {o.slot.className && ` · ${o.slot.className}`}
                        {o.cancelled && " (annullata)"}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {chosen.length === 0 && (
              <div className="flex flex-wrap items-end gap-4 border-t border-line pt-4">
                <div>
                  <span className="mb-1 block text-[13px] font-medium">Durata prevista</span>
                  <div className="flex gap-1.5">
                    {[1, 2].map((h) => (
                      <button
                        key={h}
                        type="button"
                        aria-pressed={declared === h * lessonMinutes}
                        onClick={() => setDuration(h * lessonMinutes)}
                        className={cx(
                          "tabular h-9 rounded-md border px-3",
                          declared === h * lessonMinutes ? "border-accent bg-accent-soft font-medium text-accent" : "border-line-strong hover:border-accent",
                        )}
                      >
                        {h === 1 ? "1 ora" : "2 ore"} · {h * lessonMinutes}’
                      </button>
                    ))}
                  </div>
                </div>
                <Field label="Altra durata (min)" className="w-32">
                  <Input
                    type="number"
                    min={5}
                    max={600}
                    value={declared}
                    onChange={(e) => {
                      const n = Math.round(Number(e.target.value));
                      if (n >= 1 && n <= 600) setDuration(n);
                    }}
                  />
                </Field>
                <Field label="Ora di inizio (facoltativa)" className="w-44">
                  <Input type="time" value={manualStart} onChange={(e) => setManualStart(e.target.value)} />
                </Field>
              </div>
            )}
            <p className="tabular rounded-lg bg-sunken px-3 py-2 text-[13px]">
              Durata della lezione: <strong>{available}’</strong>
              {chosen.length > 0 && date && ` · ${humanDate(date, { weekday: true })}, ${chosen.map((o) => `${o.startTime}–${o.endTime}`).join(" e ")}`}
            </p>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-5">
            <label className="block">
              <span className="font-semibold">Prerequisiti degli allievi</span>
              <span className="block text-[13px] text-muted">Che cosa devono già sapere o saper fare. Uno per riga.</span>
              <AutoTextarea value={prerequisiti} onChange={(e) => setPrerequisiti(e.target.value)} minRows={3} placeholder={"- Concetto di superficie di una figura.\n- Concetto di moltiplicazione."} className={`mt-1.5 ${textareaClass}`} autoFocus />
            </label>
            <label className="block">
              <span className="font-semibold">Traguardo di apprendimento</span>
              <span className="block text-[13px] text-muted">Il traguardo del piano di studio al quale principalmente si riferisce la lezione, con il suo codice.</span>
              <AutoTextarea value={traguardo} onChange={(e) => setTraguardo(e.target.value)} minRows={2} placeholder="es. MAT.III.GM.8.EA.1: stimare, misurare, confrontare…" className={`mt-1.5 ${textareaClass}`} />
            </label>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-6">
            <p className="text-muted">Ogni obiettivo è una frase: soggetto, un verbo dell’elenco, e che cosa.</p>
            <ObjectiveBuilder kind="insegnamento" label="Obiettivo d’insegnamento" items={obIns} legacyText="" verbs={verbs} onChange={setObIns} onClearLegacy={() => {}} />
            <ObjectiveBuilder kind="apprendimento" label="Obiettivo d’apprendimento (disciplinare / trasversale)" items={obApp} legacyText="" verbs={verbs} onChange={setObApp} onClearLegacy={() => {}} />
          </div>
        )}

        {step === 3 && phases && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className={cx("tabular font-medium", total === available ? "text-ok" : "text-warn")}>
                {total}’ su {available}’
                {total > available && ` · ${total - available}’ oltre la durata prevista`}
                {total < available && ` · restano ${available - total}’`}
              </p>
              <div className="flex flex-wrap gap-2">
                {total !== available && phases.length > 0 && (
                  <Button size="sm" onClick={() => setPhases(phases.map((p, i) => ({ ...p, durationMin: redistribute(phases.map((x) => x.durationMin), available)[i] })))}>
                    <Wand2 className="size-3.5" /> Ridistribuisci
                  </Button>
                )}
                <Button size="sm" onClick={() => setPhases(proposePhases(available))}>
                  Proponi di nuovo
                </Button>
              </div>
            </div>

            <ul className="space-y-1.5">
              {phases.map((p, i) => (
                <li key={p.id} className="flex items-center gap-2">
                  <span className="tabular w-5 shrink-0 text-right text-[13px] text-muted">{i + 1}</span>
                  <Input value={p.name} onChange={(e) => patchPhase(p.id, { name: e.target.value })} placeholder="Fase" aria-label={`Nome della fase ${i + 1}`} className="min-w-0 flex-[1.3]" />
                  <Input value={p.modality} onChange={(e) => patchPhase(p.id, { modality: e.target.value })} placeholder="modalità" aria-label={`Modalità della fase ${i + 1}`} className="min-w-0 flex-1 max-sm:hidden" />
                  <Input
                    type="number"
                    min={0}
                    max={600}
                    step={5}
                    value={p.durationMin}
                    onChange={(e) => patchPhase(p.id, { durationMin: Math.max(0, Math.round(Number(e.target.value)) || 0) })}
                    aria-label={`Minuti della fase ${i + 1}`}
                    className="tabular w-20 shrink-0"
                  />
                  <IconButton label={`Elimina la fase ${p.name || i + 1}`} className="hover:bg-danger-soft hover:text-danger" onClick={() => setPhases(phases.filter((x) => x.id !== p.id))}>
                    <Trash2 className="size-4" />
                  </IconButton>
                </li>
              ))}
            </ul>

            <div className="flex flex-wrap items-center gap-1.5">
              <button type="button" onClick={() => setPhases([...phases, newPhase()])} className="inline-flex h-7 items-center gap-1 rounded-full bg-accent px-3 text-[13px] font-medium text-white hover:bg-accent-hover">
                <Plus className="size-3.5" /> Fase vuota
              </button>
              {phaseTemplates.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setPhases([...phases, newPhase({ name: t.name, modality: t.modality, durationMin: t.durationMin })])}
                  className="tabular inline-flex h-7 items-center gap-1 rounded-full border border-line-strong px-2.5 text-[13px] hover:border-accent hover:text-accent"
                >
                  <Plus className="size-3 opacity-60" />
                  {t.name} <span className="text-muted">{t.durationMin}’</span>
                </button>
              ))}
            </div>

            {planTemplates.length > 0 && (
              <Field label="Oppure parti dalle fasi di un tuo modello" className="max-w-sm border-t border-line pt-4">
                <select className={inputClass} value="" onChange={(e) => copyFromTemplate(e.target.value)}>
                  <option value="">scegli un modello…</option>
                  {planTemplates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.title || "Senza titolo"} ({t.phaseCount} fasi, {t.totalMin}’)
                    </option>
                  ))}
                </select>
              </Field>
            )}
            <p className="text-[13px] text-muted">Descrizione, prodotto atteso e materiale di ogni fase li scrivi nel piano, dopo averlo creato.</p>
          </div>
        )}

        {step === 4 && (
          <div className="space-y-5">
            <label className="block">
              <span className="font-semibold">Verifica dell’obiettivo</span>
              <span className="block text-[13px] text-muted">Quali azioni dell’allievo mi permettono di capire se l’obiettivo di apprendimento è stato raggiunto?</span>
              <AutoTextarea value={verifica} onChange={(e) => setVerifica(e.target.value)} minRows={3} placeholder="L’allievo…" className={`mt-1.5 ${textareaClass}`} autoFocus />
            </label>

            <div className="rounded-lg bg-sunken px-4 py-3">
              <h2 className="mb-1.5 font-semibold">Riepilogo</h2>
              <dl className="tabular grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-[13px]">
                <dt className="text-muted">Titolo</dt>
                <dd>{title || <span className="text-warn">da scrivere</span>}</dd>
                <dt className="text-muted">Lezione</dt>
                <dd>
                  {date ? humanDate(date, { weekday: true }) : "senza data"} · {available}’
                </dd>
                <dt className="text-muted">Obiettivi</dt>
                <dd>
                  {obIns.length} d’insegnamento, {obApp.length} d’apprendimento
                  {(incomplete(obIns) || incomplete(obApp)) && <span className="text-warn"> · alcuni sono incompleti</span>}
                </dd>
                <dt className="text-muted">Fasi</dt>
                <dd>
                  {(phases ?? []).length || "proposte in automatico"} {phases && `· ${total}’ su ${available}’`}
                </dd>
              </dl>
            </div>
          </div>
        )}
      </div>

      <div className="mt-3">
        <ErrorNote>{error}</ErrorNote>
      </div>
      <div className="mt-4 flex items-center justify-between gap-2">
        <Button onClick={() => (step === 0 ? router.back() : goTo(step - 1))}>
          <ArrowLeft className="size-4" /> {step === 0 ? "Annulla" : "Indietro"}
        </Button>
        {step < STEPS.length - 1 ? (
          <Button variant="primary" onClick={() => goTo(step + 1)}>
            Avanti <ArrowRight className="size-4" />
          </Button>
        ) : (
          <Button variant="primary" onClick={create} loading={saving}>
            <Check className="size-4" /> Crea il piano
          </Button>
        )}
      </div>
    </div>
  );
}
