"use client";

import { ChevronLeft, ChevronRight, FileText, Plus, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Button, IconButton, Loading, PageHeader, useToast } from "@/components/ui";
import { AddDialog, EventDialog, LessonPanel } from "@/components/WeekDialogs";
import { WeekGrid, type DayColumn, type GridBlock } from "@/components/WeekGrid";
import { YearStrip, type YearData } from "@/components/YearStrip";
import { api, errorMessage } from "@/lib/api";
import { occurrencesOn } from "@/lib/calendar";
import { swatch } from "@/lib/colors";
import { addDays, consecutiveSlots, humanDate, mondayOf, parseDate, today, WEEKDAYS } from "@/lib/plan-utils";
import type { EventDTO, Occurrence, PlanDTO, WeekDTO } from "@/lib/types";

function weekRange(days: string[]) {
  const a = parseDate(days[0]);
  const b = parseDate(days[6]);
  const sameMonth = a.getMonth() === b.getMonth();
  const end = b.toLocaleDateString("it-CH", { day: "numeric", month: "long", year: "numeric" });
  const start = a.toLocaleDateString("it-CH", sameMonth ? { day: "numeric" } : { day: "numeric", month: "long" });
  return `${start} – ${end}`;
}

const Chip = ({ color, children, title }: { color: string; children: React.ReactNode; title?: string }) => {
  const c = swatch(color);
  return (
    <span title={title} className="block truncate rounded px-1.5 py-0.5 text-xs" style={{ background: c.bg, color: c.text }}>
      {children}
    </span>
  );
};

export default function SettimanaPage() {
  const router = useRouter();
  const toast = useToast();
  const [monday, setMonday] = useState(() => mondayOf(today()));
  const [week, setWeek] = useState<WeekDTO | null>(null);
  const [year, setYear] = useState<YearData | null>(null);
  const [version, setVersion] = useState(0);
  const [adding, setAdding] = useState<{ date: string; time: string } | null>(null);
  const [selected, setSelected] = useState<{ slotId: string; date: string } | null>(null);
  const [editingEvent, setEditingEvent] = useState<EventDTO | null>(null);

  useEffect(() => {
    let stale = false;
    api.get<WeekDTO>(`/api/week?date=${monday}`).then(
      (w) => !stale && setWeek(w),
      (e) => !stale && toast(errorMessage(e), "error"),
    );
    api.get<YearData>(`/api/year?date=${monday}`).then((y) => !stale && setYear(y), () => {});
    return () => {
      stale = true;
    };
  }, [monday, version, toast]);

  const reload = useCallback(() => {
    setAdding(null);
    setSelected(null);
    setEditingEvent(null);
    setVersion((v) => v + 1);
  }, []);

  if (!week) return <Loading />;

  const now = today();
  const occurrences: Occurrence[] = week.days.flatMap((d) => occurrencesOn(d, week.slots, week.exceptions));
  const planFor = (slotId: string, date: string) => week.plans.find((p) => p.date === date && p.slotIds.includes(slotId));
  const current = selected ? occurrences.find((o) => o.slot.id === selected.slotId && o.date === selected.date) ?? null : null;

  /** Lezione doppia: un nuovo piano copre anche le ore consecutive ancora libere quel giorno. */
  const slotsForNewPlan = (occ: Occurrence) =>
    consecutiveSlots(
      occ.slot,
      occurrences.filter((o) => o.date === occ.date && !o.cancelled).map((o) => o.slot),
    )
      .filter((s) => !planFor(s.id, occ.date))
      .map((s) => s.id);

  async function createEmptyPlan(occ: Occurrence) {
    try {
      const plan = await api.post<PlanDTO>("/api/plans", { date: occ.date, slotIds: slotsForNewPlan(occ) });
      router.push(`/piani/${plan.id}`);
    } catch (e) {
      toast(errorMessage(e), "error");
    }
  }

  const days: DayColumn[] = week.days.map((date, i) => {
    const holiday = week.holidays.find((h) => h.date === date);
    const allDay = [
      ...week.events.filter((e) => e.date === date && !e.startTime),
      ...week.external.filter((e) => e.date === date && !e.startTime),
    ];
    return {
      weekday: i + 1,
      title: WEEKDAYS[i],
      subtitle: parseDate(date).toLocaleDateString("it-CH", { day: "numeric", month: "short" }),
      highlight: date === now,
      shaded: !!holiday,
      notes:
        holiday || allDay.length ? (
          <>
            {holiday && (
              <span className="block truncate rounded bg-line px-1.5 py-0.5 text-xs font-medium" title={holiday.name}>
                {holiday.name}
              </span>
            )}
            {allDay.map((e, n) =>
              "id" in e ? (
                <button key={e.id} type="button" onClick={() => setEditingEvent(e)} className="block w-full text-left">
                  <Chip color={e.color} title={e.note || e.title}>
                    {e.title}
                  </Chip>
                </button>
              ) : (
                <Chip key={`x${n}`} color="slate" title={`${e.title} (${e.calendar})`}>
                  {e.title}
                </Chip>
              ),
            )}
          </>
        ) : undefined,
    };
  });

  const blocks: GridBlock[] = [
    ...occurrences.map((o): GridBlock => {
      const plan = planFor(o.slot.id, o.date);
      const dayName = WEEKDAYS[o.slot.weekday - 1];
      return {
        key: `l-${o.slot.id}-${o.date}`,
        weekday: o.slot.weekday,
        start: o.startTime,
        end: o.endTime,
        color: o.slot.color,
        muted: o.cancelled,
        label: `${o.slot.subject} ${o.slot.className}, ${dayName} ${o.startTime}${o.cancelled ? ", annullata" : plan ? `, piano "${plan.title || "Senza titolo"}"` : ", senza piano"}`,
        onClick: () => setSelected({ slotId: o.slot.id, date: o.date }),
        content: (
          <>
            <span className={o.cancelled ? "block truncate font-semibold line-through" : "block truncate font-semibold"}>
              {o.slot.subject}
              {o.slot.className && <span className="font-normal"> · {o.slot.className}</span>}
            </span>
            <span className="tabular block opacity-75">
              {o.startTime}–{o.endTime}
              {o.modified && " · spostata"}
            </span>
            {o.cancelled ? (
              <span className="mt-0.5 block">Annullata</span>
            ) : plan ? (
              <span className="mt-0.5 flex items-center gap-1 font-medium">
                <FileText className="size-3 shrink-0" aria-hidden />
                <span className="truncate">{plan.title || "Senza titolo"}</span>
              </span>
            ) : (
              <span className="mt-0.5 flex items-center gap-1 opacity-60">
                <Plus className="size-3 shrink-0" aria-hidden />
                Piano
              </span>
            )}
          </>
        ),
      };
    }),
    ...week.events
      .filter((e) => e.startTime && e.endTime)
      .map((e): GridBlock => ({
        key: `e-${e.id}`,
        weekday: week.days.indexOf(e.date) + 1,
        start: e.startTime!,
        end: e.endTime!,
        color: e.color,
        dashed: true,
        label: `Evento ${e.title}, ${e.startTime}`,
        onClick: () => setEditingEvent(e),
        content: (
          <>
            <span className="block truncate font-semibold">{e.title}</span>
            <span className="tabular block opacity-75">
              {e.startTime}–{e.endTime}
            </span>
          </>
        ),
      })),
    ...week.external
      .filter((e) => e.startTime && e.endTime && e.endTime > e.startTime)
      .map((e, n): GridBlock => ({
        key: `x-${n}`,
        weekday: week.days.indexOf(e.date) + 1,
        start: e.startTime!,
        end: e.endTime!,
        color: "slate",
        dashed: true,
        label: `${e.title} (${e.calendar}), ${e.startTime}–${e.endTime}`,
        content: (
          <>
            <span className="block truncate font-medium">{e.title}</span>
            <span className="tabular block opacity-75">{e.startTime}</span>
          </>
        ),
      })),
  ];

  const unscheduled = week.plans.filter((p) => p.slotIds.length === 0);
  const isCurrentWeek = monday === mondayOf(now);
  const holidayWeek = week.year && week.weekNumber === null && week.holidays.length > 0;

  return (
    <>
      <PageHeader
        title={week.weekNumber ? `Settimana ${week.weekNumber}` : holidayWeek ? week.holidays[0].name : "Settimana"}
        subtitle={weekRange(week.days)}
        actions={
          <>
            <IconButton label="Settimana precedente" onClick={() => setMonday(addDays(monday, -7))}>
              <ChevronLeft className="size-4" />
            </IconButton>
            <Button onClick={() => setMonday(mondayOf(now))} disabled={isCurrentWeek}>
              Oggi
            </Button>
            <IconButton label="Settimana successiva" onClick={() => setMonday(addDays(monday, 7))}>
              <ChevronRight className="size-4" />
            </IconButton>
            <Button onClick={() => setAdding({ date: week.days.includes(now) ? now : monday, time: "08:00" })}>
              <Plus className="size-4" /> Lezione o evento
            </Button>
            <Link href="/piani/nuovo">
              <Button variant="primary">
                <Plus className="size-4" /> Nuovo piano
              </Button>
            </Link>
          </>
        }
      />

      {year && <YearStrip data={year} selected={monday} onSelect={setMonday} />}

      {week.calendarErrors.length > 0 && (
        <p className="mb-3 flex items-start gap-2 rounded-lg bg-warn-soft px-3 py-2 text-[13px] text-warn">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          Calendario non leggibile in questo momento: {week.calendarErrors.join("; ")}
        </p>
      )}

      <WeekGrid days={days} blocks={blocks} onEmptyClick={(weekday, time) => setAdding({ date: week.days[weekday - 1], time })} />
      <p className="mt-2 text-xs text-muted">
        {week.slots.length === 0
          ? "Il tuo orario è vuoto: fai clic su un punto della griglia per aggiungere la prima lezione. Si ripeterà ogni settimana."
          : "Clic su uno spazio vuoto per aggiungere una lezione o un evento, su una lezione per vederne i dettagli e il piano."}
      </p>

      {unscheduled.length > 0 && (
        <section className="mt-6">
          <h2 className="mb-2 font-medium">Altri piani di questa settimana</h2>
          <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
            {unscheduled.map((p) => (
              <li key={p.id}>
                <Link href={`/piani/${p.id}`} className="flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-sunken">
                  <span className="truncate font-medium">{p.title || "Senza titolo"}</span>
                  <span className="tabular shrink-0 text-muted">
                    {p.date && humanDate(p.date, { weekday: true, year: false })} · {p.totalMin}’
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <AddDialog
        at={adding}
        monday={monday}
        settings={week.settings}
        lastSlot={week.slots[week.slots.length - 1]}
        onClose={() => setAdding(null)}
        onDone={reload}
      />
      <LessonPanel
        occurrence={current}
        plan={current ? planFor(current.slot.id, current.date) : undefined}
        planSlotIds={current ? slotsForNewPlan(current) : []}
        monday={monday}
        settings={week.settings}
        onClose={() => setSelected(null)}
        onChanged={reload}
        onCreateEmptyPlan={() => current && createEmptyPlan(current)}
      />
      <EventDialog event={editingEvent} onClose={() => setEditingEvent(null)} onDone={reload} />
    </>
  );
}
