"use client";

import { Ban, CalendarClock, FileText, Pencil, Plus, RotateCcw, Trash2, Wand2 } from "lucide-react";
import Link from "next/link";
import { useState, type FormEvent, type ReactNode } from "react";
import { api, errorMessage } from "@/lib/api";
import { addDays, humanDate, WEEKDAYS, weekdayOf } from "@/lib/plan-utils";
import { fromMin, toMin } from "@/lib/schedule";
import type { EventDTO, Occurrence, PlanSummary, SlotDTO } from "@/lib/types";
import { Button, ColorPicker, cx, Dialog, ErrorNote, Field, Input, inputClass } from "./ui";

type LessonSettings = { lessonMinutes: number; defaultHours: number };
type SlotDraft = Pick<SlotDTO, "weekday" | "startTime" | "endTime" | "subject" | "className" | "room" | "color">;
type EventDraft = Omit<EventDTO, "id">;

const endAfter = (start: string, minutes: number) => fromMin(Math.min(toMin(start) + minutes, 1439));

function Tabs<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: [T, string][] }) {
  return (
    <div role="tablist" className="mb-4 flex gap-1 rounded-lg bg-sunken p-1">
      {options.map(([key, label]) => (
        <button
          key={key}
          type="button"
          role="tab"
          aria-selected={value === key}
          onClick={() => onChange(key)}
          className={cx("h-8 flex-1 rounded-md font-medium transition-colors", value === key ? "bg-surface shadow-sm" : "text-muted hover:text-ink")}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

/** Orario di inizio + durata in ore di lezione (1 ora, 2 ore) oppure fine libera. */
function TimeFields({
  start,
  end,
  lessonMinutes,
  onChange,
}: {
  start: string;
  end: string;
  lessonMinutes: number;
  onChange: (start: string, end: string) => void;
}) {
  const length = toMin(end) - toMin(start);
  return (
    <div className="grid grid-cols-2 gap-3">
      <Field label="Inizio">
        <Input
          type="time"
          value={start}
          required
          // Spostando l'inizio la durata resta invariata.
          onChange={(e) => e.target.value && onChange(e.target.value, endAfter(e.target.value, length > 0 ? length : lessonMinutes))}
        />
      </Field>
      <Field label="Fine">
        <Input type="time" value={end} required onChange={(e) => onChange(start, e.target.value)} />
      </Field>
      <div className="col-span-2 flex flex-wrap items-center gap-1.5">
        <span className="text-[13px] text-muted">Durata:</span>
        {[1, 2].map((h) => (
          <button
            key={h}
            type="button"
            aria-pressed={length === h * lessonMinutes}
            onClick={() => onChange(start, endAfter(start, h * lessonMinutes))}
            className={cx(
              "tabular h-7 rounded-full border px-2.5 text-[13px]",
              length === h * lessonMinutes ? "border-accent bg-accent-soft font-medium text-accent" : "border-line-strong hover:border-accent",
            )}
          >
            {h === 1 ? "1 ora" : `${h} ore`} · {h * lessonMinutes}’
          </button>
        ))}
        {length > 0 && length !== lessonMinutes && length !== 2 * lessonMinutes && (
          <span className="tabular text-[13px] text-muted">{length}’</span>
        )}
      </div>
    </div>
  );
}

function SlotFields({ draft, set, lessonMinutes }: { draft: SlotDraft; set: (d: SlotDraft) => void; lessonMinutes: number }) {
  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Materia" className="col-span-2">
          <Input value={draft.subject} onChange={(e) => set({ ...draft, subject: e.target.value })} required autoFocus />
        </Field>
        <Field label="Classe">
          <Input value={draft.className} onChange={(e) => set({ ...draft, className: e.target.value })} placeholder="es. 3A" />
        </Field>
        <Field label="Aula">
          <Input value={draft.room} onChange={(e) => set({ ...draft, room: e.target.value })} />
        </Field>
        <Field label="Giorno" className="col-span-2">
          <select className={inputClass} value={draft.weekday} onChange={(e) => set({ ...draft, weekday: Number(e.target.value) })}>
            {WEEKDAYS.map((d, i) => (
              <option key={d} value={i + 1}>
                {d}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <TimeFields
        start={draft.startTime}
        end={draft.endTime}
        lessonMinutes={lessonMinutes}
        onChange={(startTime, endTime) => set({ ...draft, startTime, endTime })}
      />
      <div>
        <span className="mb-1.5 block text-[13px] font-medium">Colore</span>
        <ColorPicker value={draft.color} onChange={(color) => set({ ...draft, color })} />
      </div>
    </>
  );
}

function ScopeChoice({ value, onChange, monday }: { value: "future" | "always"; onChange: (v: "future" | "always") => void; monday: string }) {
  const options: ["future" | "always", string, string][] = [
    ["future", "Da questa settimana in poi", `Le settimane prima del ${humanDate(monday, { year: false })} restano come sono.`],
    ["always", "Sempre", "Anche nelle settimane passate."],
  ];
  return (
    <fieldset className="space-y-1.5">
      <legend className="mb-1 text-[13px] font-medium">Vale</legend>
      {options.map(([key, label, hint]) => (
        <label key={key} className={cx("flex cursor-pointer gap-2.5 rounded-lg border px-3 py-2", value === key ? "border-accent bg-accent-soft" : "border-line-strong")}>
          <input type="radio" name="scope" className="mt-1 accent-[var(--accent)]" checked={value === key} onChange={() => onChange(key)} />
          <span>
            <span className="block font-medium">{label}</span>
            <span className="block text-[13px] text-muted">{hint}</span>
          </span>
        </label>
      ))}
    </fieldset>
  );
}

function FormFooter({ onCancel, saving, left, submitLabel = "Salva" }: { onCancel: () => void; saving: boolean; left?: ReactNode; submitLabel?: string }) {
  return (
    <div className="flex items-center justify-between gap-2 pt-1">
      {left ?? <span />}
      <div className="flex gap-2">
        <Button onClick={onCancel}>Annulla</Button>
        <Button type="submit" variant="primary" loading={saving}>
          {submitLabel}
        </Button>
      </div>
    </div>
  );
}

function EventFields({ draft, set }: { draft: EventDraft; set: (d: EventDraft) => void }) {
  const allDay = !draft.startTime;
  return (
    <>
      <Field label="Titolo">
        <Input value={draft.title} onChange={(e) => set({ ...draft, title: e.target.value })} required autoFocus placeholder="es. Gita al museo" />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Tipo">
          <select className={inputClass} value={draft.kind} onChange={(e) => set({ ...draft, kind: e.target.value as EventDTO["kind"] })}>
            <option value="gita">Gita / uscita</option>
            <option value="altro">Altro</option>
          </select>
        </Field>
        <Field label="Giorno">
          <Input type="date" value={draft.date} required onChange={(e) => e.target.value && set({ ...draft, date: e.target.value })} />
        </Field>
      </div>
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          className="size-4 accent-[var(--accent)]"
          checked={allDay}
          onChange={(e) => set({ ...draft, startTime: e.target.checked ? null : "08:00", endTime: e.target.checked ? null : "12:00" })}
        />
        Tutto il giorno
      </label>
      {!allDay && (
        <div className="grid grid-cols-2 gap-3">
          <Field label="Inizio">
            <Input type="time" value={draft.startTime ?? ""} required onChange={(e) => set({ ...draft, startTime: e.target.value || null })} />
          </Field>
          <Field label="Fine">
            <Input type="time" value={draft.endTime ?? ""} required onChange={(e) => set({ ...draft, endTime: e.target.value || null })} />
          </Field>
        </div>
      )}
      <Field label="Nota">
        <Input value={draft.note} onChange={(e) => set({ ...draft, note: e.target.value })} />
      </Field>
      <div>
        <span className="mb-1.5 block text-[13px] font-medium">Colore</span>
        <ColorPicker value={draft.color} onChange={(color) => set({ ...draft, color })} />
      </div>
    </>
  );
}

// --- Aggiunta: lezione ricorrente oppure evento di un giorno ---

export function AddDialog({
  at,
  monday,
  settings,
  lastSlot,
  onClose,
  onDone,
}: {
  at: { date: string; time: string } | null;
  monday: string;
  settings: LessonSettings;
  lastSlot?: SlotDTO;
  onClose: () => void;
  onDone: () => void;
}) {
  return (
    <Dialog open={!!at} onClose={onClose} title="Aggiungi">
      {at && <AddForm key={at.date + at.time} at={at} monday={monday} settings={settings} lastSlot={lastSlot} onClose={onClose} onDone={onDone} />}
    </Dialog>
  );
}

function AddForm({
  at,
  monday,
  settings,
  lastSlot,
  onClose,
  onDone,
}: {
  at: { date: string; time: string };
  monday: string;
  settings: LessonSettings;
  lastSlot?: SlotDTO;
  onClose: () => void;
  onDone: () => void;
}) {
  const [tab, setTab] = useState<"lesson" | "event">("lesson");
  const [slot, setSlot] = useState<SlotDraft>({
    weekday: weekdayOf(at.date),
    startTime: at.time,
    endTime: endAfter(at.time, settings.defaultHours * settings.lessonMinutes),
    // Materia e classe dell'ultima lezione: di solito si ripetono.
    subject: lastSlot?.subject ?? "",
    className: lastSlot?.className ?? "",
    room: lastSlot?.room ?? "",
    color: lastSlot?.color ?? "teal",
  });
  const [event, setEvent] = useState<EventDraft>({
    title: "", date: at.date, startTime: null, endTime: null, kind: "gita", color: "amber", note: "",
  });
  const [past, setPast] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      if (tab === "lesson") await api.post("/api/timetable", { ...slot, validFrom: past ? null : monday });
      else await api.post("/api/events", event);
      onDone();
    } catch (err) {
      setError(errorMessage(err));
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <Tabs value={tab} onChange={setTab} options={[["lesson", "Lezione ricorrente"], ["event", "Evento di un giorno"]]} />
      {tab === "lesson" ? (
        <>
          <SlotFields draft={slot} set={setSlot} lessonMinutes={settings.lessonMinutes} />
          <label className="flex items-start gap-2 rounded-lg bg-sunken px-3 py-2 text-[13px]">
            <input type="checkbox" className="mt-0.5 size-4 accent-[var(--accent)]" checked={past} onChange={(e) => setPast(e.target.checked)} />
            <span>
              Si ripete ogni settimana a partire da questa.
              <span className="block text-muted">Spunta per farla comparire anche nelle settimane passate.</span>
            </span>
          </label>
        </>
      ) : (
        <EventFields draft={event} set={setEvent} />
      )}
      <ErrorNote>{error}</ErrorNote>
      <FormFooter onCancel={onClose} saving={saving} submitLabel="Aggiungi" />
    </form>
  );
}

// --- Evento esistente ---

export function EventDialog({ event, onClose, onDone }: { event: EventDTO | null; onClose: () => void; onDone: () => void }) {
  return (
    <Dialog open={!!event} onClose={onClose} title="Evento">
      {event && <EventForm key={event.id} event={event} onClose={onClose} onDone={onDone} />}
    </Dialog>
  );
}

function EventForm({ event, onClose, onDone }: { event: EventDTO; onClose: () => void; onDone: () => void }) {
  const { id, ...initial } = event;
  const [draft, setDraft] = useState<EventDraft>(initial);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const run = async (fn: () => Promise<unknown>) => {
    setSaving(true);
    setError("");
    try {
      await fn();
      onDone();
    } catch (err) {
      setError(errorMessage(err));
      setSaving(false);
    }
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        run(() => api.put(`/api/events/${id}`, draft));
      }}
      className="space-y-4"
    >
      <EventFields draft={draft} set={setDraft} />
      <ErrorNote>{error}</ErrorNote>
      <FormFooter
        onCancel={onClose}
        saving={saving}
        left={
          <Button variant="danger" onClick={() => confirm(`Eliminare l'evento "${event.title}"?`) && run(() => api.del(`/api/events/${id}`))}>
            <Trash2 className="size-4" /> Elimina
          </Button>
        }
      />
    </form>
  );
}

// --- Pannello di una lezione in un giorno preciso ---

export function LessonPanel({
  occurrence,
  plan,
  planSlotIds,
  monday,
  settings,
  onClose,
  onChanged,
  onCreateEmptyPlan,
}: {
  occurrence: Occurrence | null;
  plan: PlanSummary | undefined;
  /** Le ore (consecutive, ancora senza piano) che un nuovo piano coprirebbe. */
  planSlotIds: string[];
  monday: string;
  settings: LessonSettings;
  onClose: () => void;
  onChanged: () => void;
  onCreateEmptyPlan: () => void;
}) {
  const title = occurrence ? [occurrence.slot.subject, occurrence.slot.className].filter(Boolean).join(" · ") : "";
  return (
    <Dialog open={!!occurrence} onClose={onClose} title={title}>
      {occurrence && (
        <LessonBody
          key={occurrence.slot.id + occurrence.date}
          occ={occurrence}
          plan={plan}
          planSlotIds={planSlotIds}
          monday={monday}
          settings={settings}
          onClose={onClose}
          onChanged={onChanged}
          onCreateEmptyPlan={onCreateEmptyPlan}
        />
      )}
    </Dialog>
  );
}

function LessonBody({
  occ,
  plan,
  planSlotIds,
  monday,
  settings,
  onClose,
  onChanged,
  onCreateEmptyPlan,
}: {
  occ: Occurrence;
  plan: PlanSummary | undefined;
  planSlotIds: string[];
  monday: string;
  settings: LessonSettings;
  onClose: () => void;
  onChanged: () => void;
  onCreateEmptyPlan: () => void;
}) {
  const { slot } = occ;
  const [mode, setMode] = useState<"view" | "day" | "series" | "delete">("view");
  const [day, setDay] = useState({ startTime: occ.startTime, endTime: occ.endTime, room: occ.room, note: occ.note });
  const [series, setSeries] = useState<SlotDraft>({
    weekday: slot.weekday, startTime: slot.startTime, endTime: slot.endTime,
    subject: slot.subject, className: slot.className, room: slot.room, color: slot.color,
  });
  const [scope, setScope] = useState<"future" | "always">("future");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const run = async (fn: () => Promise<unknown>) => {
    setSaving(true);
    setError("");
    try {
      await fn();
      onChanged();
    } catch (err) {
      setError(errorMessage(err));
      setSaving(false);
    }
  };
  const exceptionUrl = `/api/timetable/${slot.id}/exceptions/${occ.date}`;

  if (mode === "day") {
    return (
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          run(() => api.put(exceptionUrl, { kind: "modificata", ...day, room: day.room || null }));
        }}
      >
        <p className="text-muted">Solo per {humanDate(occ.date, { weekday: true, year: false })}. Le altre settimane non cambiano.</p>
        <TimeFields
          start={day.startTime}
          end={day.endTime}
          lessonMinutes={settings.lessonMinutes}
          onChange={(startTime, endTime) => setDay({ ...day, startTime, endTime })}
        />
        <Field label="Aula">
          <Input value={day.room} onChange={(e) => setDay({ ...day, room: e.target.value })} />
        </Field>
        <Field label="Nota">
          <Input value={day.note} onChange={(e) => setDay({ ...day, note: e.target.value })} placeholder="es. scambio con un collega" />
        </Field>
        <ErrorNote>{error}</ErrorNote>
        <FormFooter onCancel={() => setMode("view")} saving={saving} />
      </form>
    );
  }

  if (mode === "series") {
    return (
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          run(() =>
            scope === "always"
              ? api.put(`/api/timetable/${slot.id}`, series)
              : api.post(`/api/timetable/${slot.id}/split`, { from: monday, slot: series }),
          );
        }}
      >
        <SlotFields draft={series} set={setSeries} lessonMinutes={settings.lessonMinutes} />
        <ScopeChoice value={scope} onChange={setScope} monday={monday} />
        <ErrorNote>{error}</ErrorNote>
        <FormFooter onCancel={() => setMode("view")} saving={saving} />
      </form>
    );
  }

  if (mode === "delete") {
    return (
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          run(() =>
            scope === "always" ? api.del(`/api/timetable/${slot.id}`) : api.post(`/api/timetable/${slot.id}/end`, { from: monday }),
          );
        }}
      >
        <p>Togliere la lezione ricorrente dall&apos;orario? I piani lezione non vengono eliminati: restano senza lezione collegata.</p>
        <ScopeChoice value={scope} onChange={setScope} monday={monday} />
        <ErrorNote>{error}</ErrorNote>
        <FormFooter onCancel={() => setMode("view")} saving={saving} submitLabel="Togli la lezione" />
      </form>
    );
  }

  const guided = `/piani/nuovo?date=${occ.date}&slots=${planSlotIds.join(",")}`;
  return (
    <div className="space-y-5">
      <div>
        <p className="font-medium">{humanDate(occ.date, { weekday: true })}</p>
        <p className={cx("tabular text-muted", occ.cancelled && "line-through")}>
          {occ.startTime}–{occ.endTime}
          {occ.room && ` · aula ${occ.room}`}
        </p>
        {occ.cancelled && <p className="mt-1 font-medium text-danger">Lezione annullata per questo giorno</p>}
        {occ.modified && (
          <p className="mt-1 text-warn">
            Modificata solo per questo giorno (di solito {slot.startTime}–{slot.endTime}
            {slot.room && `, aula ${slot.room}`})
          </p>
        )}
        {occ.note && <p className="mt-1 text-[13px] text-muted">Nota: {occ.note}</p>}
        {(slot.validFrom || slot.validTo) && (
          <p className="mt-1 text-[13px] text-muted">
            In orario {slot.validFrom && `dal ${humanDate(slot.validFrom)}`} {slot.validTo && `fino al ${humanDate(addDays(slot.validTo, 0))}`}
          </p>
        )}
      </div>

      <section className="rounded-xl border border-line p-3">
        <h3 className="mb-2 text-[13px] font-semibold tracking-wide text-muted uppercase">Piano lezione</h3>
        {plan ? (
          <Link href={`/piani/${plan.id}`} className="flex items-center gap-3 rounded-lg bg-accent-soft px-3 py-2.5 hover:brightness-95">
            <FileText className="size-5 shrink-0 text-accent" aria-hidden />
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium">{plan.title || "Senza titolo"}</span>
              <span className="tabular block text-[13px] text-muted">
                {plan.phaseCount} {plan.phaseCount === 1 ? "fase" : "fasi"} · {plan.totalMin}’
              </span>
            </span>
            <span className="font-medium text-accent">Apri</span>
          </Link>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <Link href={guided}>
              <Button variant="primary">
                <Wand2 className="size-4" /> Crea il piano
              </Button>
            </Link>
            <Button onClick={onCreateEmptyPlan}>
              <Plus className="size-4" /> Piano vuoto
            </Button>
          </div>
        )}
      </section>

      <section>
        <h3 className="mb-2 text-[13px] font-semibold tracking-wide text-muted uppercase">Solo questo giorno</h3>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => setMode("day")}>
            <CalendarClock className="size-4" /> Sposta o cambia aula
          </Button>
          {!occ.cancelled && (
            <Button onClick={() => run(() => api.put(exceptionUrl, { kind: "annullata", note: occ.note }))} loading={saving}>
              <Ban className="size-4" /> Annulla la lezione
            </Button>
          )}
          {(occ.cancelled || occ.modified) && (
            <Button onClick={() => run(() => api.del(exceptionUrl))} loading={saving}>
              <RotateCcw className="size-4" /> Ripristina
            </Button>
          )}
        </div>
      </section>

      <section>
        <h3 className="mb-2 text-[13px] font-semibold tracking-wide text-muted uppercase">Lezione ricorrente</h3>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => setMode("series")}>
            <Pencil className="size-4" /> Modifica
          </Button>
          <Button variant="danger" onClick={() => setMode("delete")}>
            <Trash2 className="size-4" /> Togli dall&apos;orario
          </Button>
        </div>
      </section>
      <ErrorNote>{error}</ErrorNote>
      <div className="flex justify-end">
        <Button onClick={onClose}>Chiudi</Button>
      </div>
    </div>
  );
}
