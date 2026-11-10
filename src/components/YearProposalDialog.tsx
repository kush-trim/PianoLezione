"use client";

import { CalendarRange } from "lucide-react";
import { useState } from "react";
import { api, errorMessage } from "@/lib/api";
import { addDays, humanDate, parseDate, WEEKDAYS_SHORT } from "@/lib/plan-utils";
import type { ProposalDTO } from "@/lib/types";
import { Button, cx, Dialog, ErrorNote, inputClass } from "./ui";

type Row = { include: boolean; monday: string; choice: string };

const short = (d: string) => parseDate(d).toLocaleDateString("it-CH", { day: "numeric", month: "short" });
const NO_LESSON = "";

/** Valore della scelta "lezione": la data e le ore, oppure solo il giorno (senza lezione). */
const lessonValue = (date: string, slotIds: string[]) => `${date}|${slotIds.join(",")}`;
const dayValue = (date: string) => `${date}|`;

/**
 * Dopo aver copiato dei piani nella cartella di un nuovo anno: per ognuno propone la settimana
 * (la stessa dell'anno prima) e la lezione; si può cambiare tutto prima di confermare.
 */
export function YearProposalDialog({
  proposal,
  onClose,
  onDone,
}: {
  proposal: ProposalDTO | null;
  onClose: () => void;
  onDone: (scheduled: number) => void;
}) {
  return (
    <Dialog open={!!proposal} onClose={onClose} title={proposal ? `In quale settimana del ${proposal.year.name}?` : ""} wide>
      {proposal && <Body key={proposal.plans.map((p) => p.planId).join()} proposal={proposal} onClose={onClose} onDone={onDone} />}
    </Dialog>
  );
}

function Body({ proposal, onClose, onDone }: { proposal: ProposalDTO; onClose: () => void; onDone: (n: number) => void }) {
  const firstMonday = proposal.weeks[0]?.monday ?? "";
  const [rows, setRows] = useState<Record<string, Row>>(() =>
    Object.fromEntries(
      proposal.plans.map((p) => [
        p.planId,
        {
          include: !!p.date,
          monday: p.monday ?? firstMonday,
          choice: p.date ? (p.slotIds.length ? lessonValue(p.date, p.slotIds) : dayValue(p.date)) : NO_LESSON,
        },
      ]),
    ),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const set = (id: string, patch: Partial<Row>) => setRows((r) => ({ ...r, [id]: { ...r[id], ...patch } }));
  const weekOf = (monday: string) => proposal.weeks.find((w) => w.monday === monday);
  const chosen = Object.values(rows).filter((r) => r.include && r.choice);

  async function confirm() {
    setSaving(true);
    setError("");
    try {
      for (const p of proposal.plans) {
        const r = rows[p.planId];
        if (!r.include || !r.choice) continue;
        const [date, slots] = r.choice.split("|");
        await api.put(`/api/plans/${p.planId}`, { date, slotIds: slots ? slots.split(",") : [] });
      }
      onDone(chosen.length);
    } catch (e) {
      setError(errorMessage(e));
      setSaving(false);
    }
  }

  if (proposal.weeks.length === 0) {
    return (
      <div className="space-y-4">
        <p>Nell&apos;anno {proposal.year.name} non c&apos;è ancora nessuna settimana di scuola: controlla le date dell&apos;anno nelle Impostazioni.</p>
        <div className="flex justify-end">
          <Button onClick={onClose}>Chiudi</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-muted">
        Ho proposto la stessa settimana dell&apos;anno precedente e la lezione della stessa classe nella stessa posizione. Cambia quello che vuoi,
        oppure togli la spunta per lasciare un piano senza data.
      </p>
      <ul className="space-y-2">
        {proposal.plans.map((p) => {
          const r = rows[p.planId];
          const week = weekOf(r.monday);
          const days = Array.from({ length: 5 }, (_, i) => addDays(r.monday, i));
          return (
            <li key={p.planId} className={cx("rounded-lg border px-3 py-2.5", r.include ? "border-line-strong" : "border-line opacity-60")}>
              <label className="flex items-start gap-2.5">
                <input
                  type="checkbox"
                  className="mt-1 size-4 accent-[var(--accent)]"
                  checked={r.include}
                  onChange={(e) => set(p.planId, { include: e.target.checked })}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{p.title || "Senza titolo"}</span>
                  <span className="block text-[13px] text-muted">
                    {p.sourceDate
                      ? `Anno precedente: ${p.sourceWeek ? `settimana ${p.sourceWeek}, ` : ""}${humanDate(p.sourceDate, { weekday: true })}`
                      : "Senza data nell'anno precedente"}
                  </span>
                </span>
              </label>
              {r.include && (
                <div className="mt-2 grid gap-2 pl-6.5 sm:grid-cols-[180px_minmax(0,1fr)]">
                  <select
                    aria-label="Settimana"
                    className={inputClass}
                    value={r.monday}
                    onChange={(e) => {
                      const w = weekOf(e.target.value);
                      // Cambiando settimana si propone la prima lezione libera della stessa classe e materia.
                      const old = weekOf(r.monday)?.lessons.find((l) => lessonValue(l.date, l.slotIds) === r.choice);
                      const same = w?.lessons.find((l) => !l.taken && old && l.className === old.className && l.subject === old.subject);
                      set(p.planId, { monday: e.target.value, choice: same ? lessonValue(same.date, same.slotIds) : NO_LESSON });
                    }}
                  >
                    {proposal.weeks.map((w) => (
                      <option key={w.monday} value={w.monday}>
                        Sett. {w.number} · {short(w.monday)}–{short(addDays(w.monday, 4))}
                      </option>
                    ))}
                  </select>
                  <select aria-label="Lezione" className={inputClass} value={r.choice} onChange={(e) => set(p.planId, { choice: e.target.value })}>
                    <option value={NO_LESSON}>Scegli la lezione…</option>
                    {week?.lessons.length ? (
                      <optgroup label="Lezioni dell'orario">
                        {week.lessons.map((l) => (
                          <option key={lessonValue(l.date, l.slotIds)} value={lessonValue(l.date, l.slotIds)}>
                            {WEEKDAYS_SHORT[(parseDate(l.date).getDay() + 6) % 7]} {short(l.date)} · {l.startTime}–{l.endTime} · {l.subject}
                            {l.className && ` ${l.className}`}
                            {l.taken ? " (ha già un piano)" : ""}
                          </option>
                        ))}
                      </optgroup>
                    ) : null}
                    <optgroup label="Solo il giorno, senza lezione">
                      {days.map((d) => (
                        <option key={d} value={dayValue(d)}>
                          {humanDate(d, { weekday: true, year: false })}
                        </option>
                      ))}
                    </optgroup>
                  </select>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <ErrorNote>{error}</ErrorNote>
      <div className="flex items-center justify-between gap-2">
        <Button variant="ghost" onClick={onClose}>
          Più tardi
        </Button>
        <Button variant="primary" onClick={confirm} loading={saving} disabled={chosen.length === 0}>
          <CalendarRange className="size-4" /> Pianifica {chosen.length} {chosen.length === 1 ? "piano" : "piani"}
        </Button>
      </div>
    </div>
  );
}
