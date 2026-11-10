"use client";

import { ChevronLeft, ChevronRight, FileText, Info, Plus, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { RemainingDialog } from "@/components/RemainingDialog";
import { Button, IconButton, isTyping, Loading, PageHeader, useToast } from "@/components/ui";
import { AddDialog, EventDialog, LessonPanel } from "@/components/WeekDialogs";
import { WeekGrid, type DayColumn, type GridBlock } from "@/components/WeekGrid";
import { YearStrip, type YearData } from "@/components/YearStrip";
import { api, errorMessage } from "@/lib/api";
import { schoolOccurrences } from "@/lib/calendar";
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

const CLASS_KEY = "ps.settimana.classe";

function readClassFilter(): string {
  try {
    return localStorage.getItem(CLASS_KEY) ?? "";
  } catch {
    return "";
  }
}

const sameClass = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

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
  // Filtro per classe: "" = tutte. Resta salvato nel browser.
  // La pagina mostra il caricamento finché arriva la settimana: leggere il browser qui non crea differenze col server.
  const [classFilter, setClassFilterState] = useState(readClassFilter);
  const [infoOpen, setInfoOpen] = useState(false);

  const setClassFilter = (c: string) => {
    setClassFilterState(c);
    try {
      localStorage.setItem(CLASS_KEY, c);
    } catch {}
  };

  // Frecce: settimana precedente / successiva; T: oggi.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e) || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "ArrowLeft") setMonday((m) => addDays(m, -7));
      else if (e.key === "ArrowRight") setMonday((m) => addDays(m, 7));
      else if (e.key.toLowerCase() === "t") setMonday(mondayOf(today()));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

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
  const holidayDates = new Set(week.holidays.map((h) => h.date));
  // Nei giorni di vacanza non ci sono lezioni; quelle tolte da una gita o giornata speciale spariscono.
  const allOccurrences: Occurrence[] = week.days.flatMap((d) =>
    schoolOccurrences(d, week.slots, week.exceptions, holidayDates, week.events),
  );
  const classes = [...new Set(week.slots.map((s) => s.className.trim()).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, "it", { numeric: true }),
  );
  if (classFilter && !classes.includes(classFilter)) classes.push(classFilter);
  const showClass = (c: string) => !classFilter || !c.trim() || sameClass(c, classFilter);
  const occurrences = allOccurrences.filter((o) => !classFilter || sameClass(o.slot.className, classFilter));
  const events = week.events.filter((e) => showClass(e.className));
  const planFor = (slotId: string, date: string) => week.plans.find((p) => p.date === date && p.slotIds.includes(slotId));
  const current = selected ? occurrences.find((o) => o.slot.id === selected.slotId && o.date === selected.date) ?? null : null;

  /** Lezione doppia: un nuovo piano copre anche le ore consecutive ancora libere quel giorno. */
  const slotsForNewPlan = (occ: Occurrence) =>
    consecutiveSlots(
      occ.slot,
      allOccurrences.filter((o) => o.date === occ.date && !o.cancelled).map((o) => o.slot),
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
      ...events.filter((e) => e.date === date && !e.startTime),
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
            {/* Ora sulla stessa riga della materia: anche una lezione corta mostra il titolo del piano. */}
            <span className="flex items-baseline gap-1">
              <span className={o.cancelled ? "min-w-0 flex-1 truncate font-semibold line-through" : "min-w-0 flex-1 truncate font-semibold"}>
                {o.slot.subject}
                {o.slot.className && <span className="font-normal"> · {o.slot.className}</span>}
              </span>
              <span className="tabular shrink-0 opacity-75" title={`${o.startTime}–${o.endTime}`}>
                {o.startTime}
                {o.modified && "*"}
              </span>
            </span>
            {o.cancelled ? (
              <span className="block">Annullata</span>
            ) : plan ? (
              <span className="flex items-center gap-1 font-medium">
                <FileText className="size-3 shrink-0" aria-hidden />
                <span className="truncate">{plan.title || "Senza titolo"}</span>
              </span>
            ) : (
              <span className="flex items-center gap-1 opacity-60">
                <Plus className="size-3 shrink-0" aria-hidden />
                Piano
              </span>
            )}
          </>
        ),
      };
    }),
    ...events
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
    // Tutto in una schermata: la griglia occupa l'altezza che resta sotto intestazione e anno.
    <div className="flex h-[calc(100dvh-5.75rem)] min-h-[520px] flex-col md:h-[calc(100dvh-3.5rem)]">
      <PageHeader
        title={week.weekNumber ? `Settimana ${week.weekNumber}` : holidayWeek ? week.holidays[0].name : "Settimana"}
        subtitle={weekRange(week.days)}
        compact
        actions={
          <>
            {classes.length > 0 && (
              <select
                aria-label="Mostra solo una classe"
                value={classFilter}
                onChange={(e) => setClassFilter(e.target.value)}
                className="h-9 max-w-44 rounded-md border border-line-strong bg-surface px-2.5"
              >
                <option value="">Tutte le classi</option>
                {classes.map((c) => (
                  <option key={c} value={c}>
                    Classe {c}
                  </option>
                ))}
              </select>
            )}
            <IconButton
              label={classFilter ? `Quanto manca alla fine dell'anno per la ${classFilter}` : "Quanto manca alla fine dell'anno"}
              className="size-9"
              onClick={() => setInfoOpen(true)}
            >
              <Info className="size-4" />
            </IconButton>
            <IconButton label="Settimana precedente (←)" className="size-9" onClick={() => setMonday(addDays(monday, -7))}>
              <ChevronLeft className="size-4" />
            </IconButton>
            <Button onClick={() => setMonday(mondayOf(now))} disabled={isCurrentWeek} title="Oggi (T)">
              Oggi
            </Button>
            <IconButton label="Settimana successiva (→)" className="size-9" onClick={() => setMonday(addDays(monday, 7))}>
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
        <p className="mb-2 flex items-start gap-2 rounded-lg bg-warn-soft px-3 py-2 text-[13px] text-warn">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          Calendario non leggibile in questo momento: {week.calendarErrors.join("; ")}
        </p>
      )}

      {unscheduled.length > 0 && (
        <div className="mb-2 flex flex-wrap items-center gap-1.5 text-[13px]">
          <span className="text-muted">Altri piani della settimana:</span>
          {unscheduled.map((p) => (
            <Link
              key={p.id}
              href={`/piani/${p.id}`}
              className="flex max-w-64 items-center gap-1 rounded-full border border-line-strong bg-surface px-2.5 py-0.5 hover:border-accent"
              title={p.date ? humanDate(p.date, { weekday: true, year: false }) : undefined}
            >
              <FileText className="size-3 shrink-0 text-muted" aria-hidden />
              <span className="truncate">{p.title || "Senza titolo"}</span>
            </Link>
          ))}
        </div>
      )}

      <div className="flex min-h-0 flex-1 flex-col">
        <WeekGrid fit days={days} blocks={blocks} onEmptyClick={(weekday, time) => setAdding({ date: week.days[weekday - 1], time })} />
      </div>
      {week.slots.length === 0 && (
        <p className="mt-1.5 text-xs text-muted">
          Il tuo orario è vuoto: fai clic su un punto della griglia per aggiungere la prima lezione. Si ripeterà ogni settimana.
        </p>
      )}

      <AddDialog
        at={adding}
        classes={classes}
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
      <EventDialog event={editingEvent} classes={classes} onClose={() => setEditingEvent(null)} onDone={reload} />
      <RemainingDialog
        open={infoOpen}
        onClose={() => setInfoOpen(false)}
        className={classFilter}
        lessonMinutes={week.settings.lessonMinutes}
      />
    </div>
  );
}
