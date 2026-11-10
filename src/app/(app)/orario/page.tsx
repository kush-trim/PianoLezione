"use client";

import { Plus, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Button, ColorPicker, Dialog, ErrorNote, Field, Input, inputClass, Loading, PageHeader, useToast } from "@/components/ui";
import { WeekGrid, type DayColumn } from "@/components/WeekGrid";
import { api, errorMessage } from "@/lib/api";
import { WEEKDAYS } from "@/lib/plan-utils";
import { fromMin, toMin } from "@/lib/schedule";
import type { SlotDTO } from "@/lib/types";

type Draft = Omit<SlotDTO, "id"> & { id?: string };

const DAYS: DayColumn[] = WEEKDAYS.map((title, i) => ({ weekday: i + 1, title }));

export default function OrarioPage() {
  const toast = useToast();
  const [slots, setSlots] = useState<SlotDTO[] | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(
    () => api.get<SlotDTO[]>("/api/timetable").then(setSlots, (e) => toast(errorMessage(e), "error")),
    [toast],
  );
  useEffect(() => {
    load();
  }, [load]);

  function open(d: Draft) {
    setError("");
    setDraft(d);
  }

  function newSlot(weekday = 1, startTime = "08:00") {
    // Riprende materia e classe dell'ultima lezione inserita: di solito si ripetono.
    const last = slots?.[slots.length - 1];
    open({
      weekday,
      startTime,
      endTime: fromMin(toMin(startTime) + 45),
      subject: last?.subject ?? "",
      className: last?.className ?? "",
      room: last?.room ?? "",
      color: last?.color ?? "teal",
    });
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!draft) return;
    setSaving(true);
    setError("");
    try {
      const { id, ...body } = draft;
      if (id) await api.put(`/api/timetable/${id}`, body);
      else await api.post("/api/timetable", body);
      await load();
      setDraft(null);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!draft?.id) return;
    if (!confirm("Eliminare questa lezione dall'orario? I piani collegati restano, ma senza orario.")) return;
    try {
      await api.del(`/api/timetable/${draft.id}`);
      await load();
      setDraft(null);
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((d) => (d ? { ...d, [key]: value } : d));

  return (
    <>
      <PageHeader
        title="Orario di insegnamento"
        subtitle="Le tue lezioni della settimana. I piani lezione prendono gli orari da qui."
        actions={
          <Button variant="primary" onClick={() => newSlot()}>
            <Plus className="size-4" /> Aggiungi lezione
          </Button>
        }
      />

      {!slots ? (
        <Loading />
      ) : (
        <>
          <WeekGrid
            days={DAYS}
            slots={slots}
            onSlotClick={(s) => open(s)}
            onEmptyClick={newSlot}
            slotLabel={(s, d) => `Modifica ${s.subject} ${s.className}, ${d.title} ${s.startTime}`}
            renderSlot={(s) => (
              <>
                <span className="block truncate font-semibold">{s.subject}</span>
                <span className="block truncate">
                  {[s.className, s.room && `aula ${s.room}`].filter(Boolean).join(" · ")}
                </span>
                <span className="tabular block opacity-75">
                  {s.startTime}–{s.endTime}
                </span>
              </>
            )}
          />
          <p className="mt-2 text-xs text-muted">
            {slots.length === 0
              ? "Nessuna lezione: fai clic su un punto della griglia per aggiungere la prima."
              : "Clic su uno spazio vuoto per aggiungere una lezione, su una lezione per modificarla."}
          </p>
        </>
      )}

      <Dialog open={!!draft} onClose={() => setDraft(null)} title={draft?.id ? "Modifica lezione" : "Nuova lezione"}>
        {draft && (
          <form id="slot-form" onSubmit={save} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Materia" className="col-span-2">
                <Input value={draft.subject} onChange={(e) => set("subject", e.target.value)} required autoFocus />
              </Field>
              <Field label="Classe">
                <Input value={draft.className} onChange={(e) => set("className", e.target.value)} placeholder="es. 3A" />
              </Field>
              <Field label="Aula">
                <Input value={draft.room} onChange={(e) => set("room", e.target.value)} />
              </Field>
              <Field label="Giorno" className="col-span-2">
                <select
                  className={inputClass}
                  value={draft.weekday}
                  onChange={(e) => set("weekday", Number(e.target.value))}
                >
                  {WEEKDAYS.map((d, i) => (
                    <option key={d} value={i + 1}>
                      {d}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Inizio">
                <Input
                  type="time"
                  value={draft.startTime}
                  onChange={(e) => {
                    // Spostando l'inizio la durata resta invariata.
                    const len = toMin(draft.endTime) - toMin(draft.startTime);
                    const start = e.target.value;
                    setDraft({ ...draft, startTime: start, endTime: start ? fromMin(Math.min(toMin(start) + len, 1439)) : draft.endTime });
                  }}
                  required
                />
              </Field>
              <Field label="Fine">
                <Input type="time" value={draft.endTime} onChange={(e) => set("endTime", e.target.value)} required />
              </Field>
            </div>
            <div>
              <span className="mb-1.5 block text-[13px] font-medium">Colore</span>
              <ColorPicker value={draft.color} onChange={(c) => set("color", c)} />
            </div>
            <ErrorNote>{error}</ErrorNote>
            <div className="flex items-center justify-between gap-2 pt-1">
              {draft.id ? (
                <Button variant="danger" onClick={remove}>
                  <Trash2 className="size-4" /> Elimina
                </Button>
              ) : (
                <span />
              )}
              <div className="flex gap-2">
                <Button onClick={() => setDraft(null)}>Annulla</Button>
                <Button type="submit" variant="primary" loading={saving}>
                  Salva
                </Button>
              </div>
            </div>
          </form>
        )}
      </Dialog>
    </>
  );
}
