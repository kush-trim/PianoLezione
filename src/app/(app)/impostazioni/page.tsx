"use client";

import { CalendarDays, Check, KeyRound, Plus, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Button, cx, ErrorNote, Field, IconButton, Input, inputClass, Loading, PageHeader, useToast } from "@/components/ui";
import { api, errorMessage } from "@/lib/api";
import { humanDate, SUBJECT } from "@/lib/plan-utils";
import type { AiProvider, HolidayDTO, SchoolYearDTO, SettingsDTO, VerbDTO, VerbKind } from "@/lib/types";

const PROVIDERS: { id: AiProvider; label: string; keyHint: string }[] = [
  { id: "anthropic", label: "Claude (Anthropic)", keyHint: "console.anthropic.com → API keys" },
  { id: "google", label: "Gemini (Google)", keyHint: "aistudio.google.com → Get API key" },
  { id: "openai", label: "OpenAI", keyHint: "platform.openai.com → API keys" },
];

function Section({ id, title, description, children }: { id?: string; title: string; description: string; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-6 rounded-xl border border-line bg-surface p-5">
      <h2 className="font-display text-xl font-semibold">{title}</h2>
      <p className="mt-0.5 mb-4 text-muted">{description}</p>
      {children}
    </section>
  );
}

// --- Verbi ---

function VerbList({ kind, verbs, onChanged }: { kind: VerbKind; verbs: VerbDTO[]; onChanged: () => void }) {
  const toast = useToast();
  const [text, setText] = useState("");
  const list = verbs.filter((v) => v.kind === kind);

  async function add(e: FormEvent) {
    e.preventDefault();
    try {
      await api.post("/api/verbs", { kind, text });
      setText("");
      onChanged();
    } catch (err) {
      toast(errorMessage(err), "error");
    }
  }

  return (
    <div>
      <h3 className="font-medium">
        {kind === "insegnamento" ? "Obiettivo d’insegnamento" : "Obiettivo d’apprendimento"}
        <span className="ml-2 font-normal text-muted">«{SUBJECT[kind]} …»</span>
      </h3>
      <ul className="mt-2 flex flex-wrap gap-1.5">
        {list.map((v) => (
          <li key={v.id} className="flex items-center gap-0.5 rounded-full border border-line-strong py-0.5 pr-0.5 pl-2.5 text-[13px]">
            {v.text}
            <button
              type="button"
              aria-label={`Togli il verbo ${v.text}`}
              onClick={() => api.del(`/api/verbs/${v.id}`).then(onChanged, (e) => toast(errorMessage(e), "error"))}
              className="flex size-5 items-center justify-center rounded-full text-muted hover:bg-danger-soft hover:text-danger"
            >
              <X className="size-3" />
            </button>
          </li>
        ))}
        {list.length === 0 && <li className="text-muted">Nessun verbo.</li>}
      </ul>
      <form onSubmit={add} className="mt-2 flex max-w-sm gap-2">
        <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="nuovo verbo, es. sperimenta" aria-label={`Nuovo verbo per ${kind}`} required />
        <Button type="submit">
          <Plus className="size-4" /> Aggiungi
        </Button>
      </form>
    </div>
  );
}

// --- Anno scolastico e vacanze ---

function PeriodForm({ onAdd, namePlaceholder, submitLabel }: { onAdd: (p: { name: string; startDate: string; endDate: string }) => Promise<void>; namePlaceholder: string; submitLabel: string }) {
  const [p, setP] = useState({ name: "", startDate: "", endDate: "" });
  const [error, setError] = useState("");
  return (
    <form
      className="mt-3 flex flex-wrap items-end gap-2"
      onSubmit={async (e) => {
        e.preventDefault();
        setError("");
        try {
          await onAdd({ ...p, endDate: p.endDate || p.startDate });
          setP({ name: "", startDate: "", endDate: "" });
        } catch (err) {
          setError(errorMessage(err));
        }
      }}
    >
      <Field label="Nome" className="min-w-40 flex-1">
        <Input value={p.name} onChange={(e) => setP({ ...p, name: e.target.value })} placeholder={namePlaceholder} required />
      </Field>
      <Field label="Dal">
        <Input type="date" value={p.startDate} onChange={(e) => setP({ ...p, startDate: e.target.value })} required />
      </Field>
      <Field label="Al">
        <Input type="date" value={p.endDate} min={p.startDate} onChange={(e) => setP({ ...p, endDate: e.target.value })} />
      </Field>
      <Button type="submit">
        <Plus className="size-4" /> {submitLabel}
      </Button>
      {error && (
        <div className="w-full">
          <ErrorNote>{error}</ErrorNote>
        </div>
      )}
    </form>
  );
}

const range = (a: string, b: string) => (a === b ? humanDate(a) : `${humanDate(a, { year: false })} – ${humanDate(b)}`);

export default function ImpostazioniPage() {
  const toast = useToast();
  const [settings, setSettings] = useState<SettingsDTO | null>(null);
  const [verbs, setVerbs] = useState<VerbDTO[]>([]);
  const [years, setYears] = useState<SchoolYearDTO[]>([]);
  const [holidays, setHolidays] = useState<HolidayDTO[]>([]);
  const [models, setModels] = useState<string[]>([]);
  const [modelsError, setModelsError] = useState("");
  const [keyDraft, setKeyDraft] = useState("");
  const [calendar, setCalendar] = useState({ name: "", url: "", asHolidays: true });
  const [calendarError, setCalendarError] = useState("");
  const [busy, setBusy] = useState("");

  const fail = useCallback((e: unknown) => toast(errorMessage(e), "error"), [toast]);
  const loadLists = useCallback(
    () =>
      Promise.all([
        api.get<VerbDTO[]>("/api/verbs"),
        api.get<SchoolYearDTO[]>("/api/school-years"),
        api.get<HolidayDTO[]>("/api/holidays"),
      ]).then(([v, y, h]) => {
        setVerbs(v);
        setYears(y);
        setHolidays(h);
      }, fail),
    [fail],
  );
  useEffect(() => {
    api.get<SettingsDTO>("/api/settings").then(setSettings, fail);
    loadLists();
  }, [fail, loadLists]);

  const provider = settings?.aiProvider || null;
  const hasKey = !!provider && !!settings?.aiKeys[provider];
  // L'elenco dei modelli si legge dal fornitore con la chiave salvata.
  useEffect(() => {
    if (!provider || !hasKey) return;
    let stale = false;
    api.get<{ models: string[]; suggested: string }>(`/api/ai/models?provider=${provider}`).then(
      (r) => {
        if (stale) return;
        setModels(r.models);
        setModelsError("");
      },
      (e) => {
        if (stale) return;
        setModels([]);
        setModelsError(errorMessage(e));
      },
    );
    return () => {
      stale = true;
    };
  }, [provider, hasKey]);

  if (!settings) return <Loading />;

  const save = (patch: Record<string, unknown>, done?: string) =>
    api.put<SettingsDTO>("/api/settings", patch).then((s) => {
      setSettings(s);
      if (done) toast(done);
    }, fail);

  async function saveKey(e: FormEvent) {
    e.preventDefault();
    if (!provider) return;
    setBusy("key");
    await save({ aiKey: { provider, key: keyDraft } }, "Chiave salvata");
    setKeyDraft("");
    setBusy("");
  }

  async function addCalendar(e: FormEvent) {
    e.preventDefault();
    setBusy("calendar");
    setCalendarError("");
    try {
      setSettings(await api.post<SettingsDTO>("/api/settings/calendars", calendar));
      setCalendar({ name: "", url: "", asHolidays: true });
      toast("Calendario collegato");
    } catch (err) {
      setCalendarError(errorMessage(err));
    }
    setBusy("");
  }

  const info = PROVIDERS.find((p) => p.id === provider);

  return (
    <>
      <PageHeader title="Impostazioni" subtitle="Le regole con cui l’app prepara lezioni e piani." />

      <div className="max-w-4xl space-y-5">
        <Section title="Lezioni" description="Quanto dura un’ora di lezione e quante ore proporre per una nuova lezione o un nuovo piano.">
          <div className="flex flex-wrap items-end gap-5">
            <Field label="Un’ora di lezione dura" className="w-44">
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min={10}
                  max={180}
                  defaultValue={settings.lessonMinutes}
                  onBlur={(e) => {
                    const n = Math.round(Number(e.target.value));
                    if (n >= 10 && n <= 180 && n !== settings.lessonMinutes) save({ lessonMinutes: n }, "Salvato");
                    else e.target.value = String(settings.lessonMinutes);
                  }}
                />
                <span className="text-muted">minuti</span>
              </div>
            </Field>
            <div>
              <span className="mb-1 block text-[13px] font-medium">Durata proposta</span>
              <div className="flex gap-1.5">
                {[1, 2].map((h) => (
                  <button
                    key={h}
                    type="button"
                    aria-pressed={settings.defaultHours === h}
                    onClick={() => save({ defaultHours: h })}
                    className={cx(
                      "tabular h-9 rounded-md border px-3",
                      settings.defaultHours === h ? "border-accent bg-accent-soft font-medium text-accent" : "border-line-strong hover:border-accent",
                    )}
                  >
                    {h === 1 ? "1 ora" : "2 ore"} · {h * settings.lessonMinutes}’
                  </button>
                ))}
              </div>
            </div>
          </div>
          <p className="mt-3 text-[13px] text-muted">
            La durata di un piano è un’indicazione: se le fasi la superano, l’app lo segnala ma non lo impedisce.
          </p>
        </Section>

        <Section title="Anno scolastico" description="Serve a numerare le settimane. Le settimane tutte di vacanza non vengono contate.">
          <ul className="divide-y divide-line rounded-lg border border-line">
            {years.map((y) => (
              <li key={y.id} className="flex items-center gap-3 px-3 py-2">
                <CalendarDays className="size-4 shrink-0 text-muted" aria-hidden />
                <span className="font-medium">{y.name}</span>
                <span className="flex-1 text-muted">{range(y.startDate, y.endDate)}</span>
                <IconButton
                  label={`Elimina l'anno ${y.name}`}
                  className="hover:bg-danger-soft hover:text-danger"
                  onClick={() => confirm(`Eliminare l'anno scolastico ${y.name}? Lezioni e piani restano.`) && api.del(`/api/school-years/${y.id}`).then(loadLists, fail)}
                >
                  <Trash2 className="size-4" />
                </IconButton>
              </li>
            ))}
            {years.length === 0 && <li className="px-3 py-2 text-muted">Nessun anno scolastico.</li>}
          </ul>
          <PeriodForm namePlaceholder="es. 2027/28" submitLabel="Aggiungi anno" onAdd={(p) => api.post("/api/school-years", p).then(loadLists)} />

          <h3 className="mt-6 mb-2 font-medium">Vacanze e giorni senza scuola</h3>
          <ul className="divide-y divide-line rounded-lg border border-line">
            {holidays.map((h) => (
              <li key={h.id} className="flex items-center gap-3 px-3 py-2">
                <span className="font-medium">{h.name}</span>
                <span className="flex-1 text-muted">{range(h.startDate, h.endDate)}</span>
                <IconButton label={`Elimina ${h.name}`} className="hover:bg-danger-soft hover:text-danger" onClick={() => api.del(`/api/holidays/${h.id}`).then(loadLists, fail)}>
                  <Trash2 className="size-4" />
                </IconButton>
              </li>
            ))}
            {holidays.length === 0 && <li className="px-3 py-2 text-muted">Nessuna vacanza inserita. Puoi anche leggerle da un calendario, più sotto.</li>}
          </ul>
          <PeriodForm namePlaceholder="es. Vacanze di Natale" submitLabel="Aggiungi vacanza" onAdd={(p) => api.post("/api/holidays", p).then(loadLists)} />
        </Section>

        <Section title="Verbi per gli obiettivi" description="Gli obiettivi dei piani si scrivono solo con questi verbi, così hanno tutti la stessa forma. Scrivili alla terza persona.">
          <div className="space-y-6">
            <VerbList kind="insegnamento" verbs={verbs} onChanged={loadLists} />
            <VerbList kind="apprendimento" verbs={verbs} onChanged={loadLists} />
          </div>
        </Section>

        <Section
          id="assistente"
          title="Assistente AI"
          description="Un assistente che propone contenuti per il piano. Usa la tua chiave personale: i costi sono quelli del tuo account presso il fornitore."
        >
          <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Fornitore">
            {PROVIDERS.map((p) => (
              <button
                key={p.id}
                type="button"
                role="radio"
                aria-checked={provider === p.id}
                onClick={() => {
                  setModels([]);
                  setModelsError("");
                  save({ aiProvider: p.id, aiModel: "" });
                }}
                className={cx(
                  "flex h-9 items-center gap-2 rounded-md border px-3",
                  provider === p.id ? "border-accent bg-accent-soft font-medium text-accent" : "border-line-strong hover:border-accent",
                )}
              >
                {p.label}
                {settings.aiKeys[p.id] && <Check className="size-3.5" aria-label="chiave salvata" />}
              </button>
            ))}
            {provider && (
              <Button variant="ghost" onClick={() => save({ aiProvider: "" })}>
                Disattiva
              </Button>
            )}
          </div>

          {provider && info && (
            <div className="mt-4 space-y-4">
              <form onSubmit={saveKey} className="flex flex-wrap items-end gap-2">
                <Field label={`Chiave API di ${info.label}`} hint={`La trovi su ${info.keyHint}. Viene salvata cifrata e non viene più mostrata.`} className="min-w-64 flex-1">
                  <Input
                    type="password"
                    value={keyDraft}
                    onChange={(e) => setKeyDraft(e.target.value)}
                    placeholder={hasKey ? "•••••••• (salvata: scrivi per sostituirla)" : "incolla qui la chiave"}
                    autoComplete="off"
                    required
                    minLength={8}
                  />
                </Field>
                <div className="flex gap-2 pb-6">
                  <Button type="submit" variant="primary" loading={busy === "key"}>
                    <KeyRound className="size-4" /> Salva chiave
                  </Button>
                  {hasKey && (
                    <Button variant="danger" onClick={() => confirm("Cancellare la chiave salvata?") && save({ aiKey: { provider, key: null } }, "Chiave cancellata")}>
                      Cancella
                    </Button>
                  )}
                </div>
              </form>

              {hasKey && (
                <Field label="Modello" hint={modelsError || "L’elenco arriva dal fornitore, con la tua chiave."} className="max-w-sm">
                  <select className={inputClass} value={settings.aiModel} onChange={(e) => save({ aiModel: e.target.value }, "Modello salvato")}>
                    <option value="">{provider === "anthropic" ? "Predefinito (claude-opus-5-5)" : "scegli un modello…"}</option>
                    {settings.aiModel && !models.includes(settings.aiModel) && <option value={settings.aiModel}>{settings.aiModel}</option>}
                    {models.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                </Field>
              )}
            </div>
          )}
        </Section>

        <Section
          title="Calendari"
          description="Collega un calendario in sola lettura per vedere eventi e vacanze nella Settimana. In Google Calendar: Impostazioni del calendario → «Indirizzo segreto in formato iCal»."
        >
          <ul className="divide-y divide-line rounded-lg border border-line">
            {settings.calendars.map((c) => (
              <li key={c.id} className="flex items-center gap-3 px-3 py-2">
                <CalendarDays className="size-4 shrink-0 text-muted" aria-hidden />
                <span className="font-medium">{c.name}</span>
                <span className="flex-1 truncate text-muted">
                  {c.host} · {c.asHolidays ? "eventi di giornata intera = vacanze" : "solo eventi"}
                </span>
                <IconButton
                  label={`Scollega ${c.name}`}
                  className="hover:bg-danger-soft hover:text-danger"
                  onClick={() => api.del<SettingsDTO>(`/api/settings/calendars/${c.id}`).then(setSettings, fail)}
                >
                  <Trash2 className="size-4" />
                </IconButton>
              </li>
            ))}
            {settings.calendars.length === 0 && <li className="px-3 py-2 text-muted">Nessun calendario collegato.</li>}
          </ul>
          <form onSubmit={addCalendar} className="mt-3 space-y-3">
            <div className="flex flex-wrap items-end gap-2">
              <Field label="Nome" className="w-44">
                <Input value={calendar.name} onChange={(e) => setCalendar({ ...calendar, name: e.target.value })} placeholder="es. Scuola" required />
              </Field>
              <Field label="Link iCal (https://…)" className="min-w-64 flex-1">
                <Input value={calendar.url} onChange={(e) => setCalendar({ ...calendar, url: e.target.value })} placeholder="https://calendar.google.com/calendar/ical/…/basic.ics" autoComplete="off" required />
              </Field>
              <Button type="submit" loading={busy === "calendar"}>
                <Plus className="size-4" /> Collega
              </Button>
            </div>
            <label className="flex items-center gap-2">
              <input type="checkbox" className="size-4 accent-[var(--accent)]" checked={calendar.asHolidays} onChange={(e) => setCalendar({ ...calendar, asHolidays: e.target.checked })} />
              Gli eventi di giornata intera di questo calendario sono giorni senza scuola
            </label>
            <ErrorNote>{calendarError}</ErrorNote>
            <p className="text-[13px] text-muted">Il link è riservato: viene salvato cifrato e qui sopra ne compare solo il sito di provenienza. I calendari si aggiornano circa ogni ora.</p>
          </form>
        </Section>
      </div>
    </>
  );
}
