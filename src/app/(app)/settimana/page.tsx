"use client";

import { ChevronLeft, ChevronRight, FileText, Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button, EmptyState, IconButton, Loading, PageHeader, useToast } from "@/components/ui";
import { WeekGrid, type DayColumn } from "@/components/WeekGrid";
import { api, errorMessage } from "@/lib/api";
import { addDays, consecutiveSlots, humanDate, mondayOf, parseDate, today, WEEKDAYS } from "@/lib/plan-utils";
import type { PlanDTO, PlanSummary, SlotDTO } from "@/lib/types";

type Week = { monday: string; days: string[]; slots: SlotDTO[]; plans: PlanSummary[] };

function weekTitle(days: string[]) {
  const a = parseDate(days[0]);
  const b = parseDate(days[6]);
  const sameMonth = a.getMonth() === b.getMonth();
  const end = b.toLocaleDateString("it-CH", { day: "numeric", month: "long", year: "numeric" });
  const start = a.toLocaleDateString("it-CH", sameMonth ? { day: "numeric" } : { day: "numeric", month: "long" });
  return `${start} – ${end}`;
}

export default function SettimanaPage() {
  const router = useRouter();
  const toast = useToast();
  const [monday, setMonday] = useState(() => mondayOf(today()));
  const [week, setWeek] = useState<Week | null>(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    let stale = false;
    api.get<Week>(`/api/week?date=${monday}`).then(
      (w) => !stale && setWeek(w),
      (e) => toast(errorMessage(e), "error"),
    );
    return () => {
      stale = true;
    };
  }, [monday, toast]);

  if (!week) return <Loading />;

  const now = today();
  const days: DayColumn[] = week.days.map((date, i) => ({
    weekday: i + 1,
    title: WEEKDAYS[i],
    subtitle: parseDate(date).toLocaleDateString("it-CH", { day: "numeric", month: "short" }),
    highlight: date === now,
  }));

  const planFor = (slot: SlotDTO, weekday: number) =>
    week.plans.find((p) => p.date === week.days[weekday - 1] && p.slotIds.includes(slot.id));

  async function openSlot(slot: SlotDTO, day: DayColumn) {
    const existing = planFor(slot, day.weekday);
    if (existing) return router.push(`/piani/${existing.id}`);
    if (creating) return;
    setCreating(true);
    try {
      // Lezione doppia: il nuovo piano copre anche le ore consecutive ancora libere.
      const slotIds = consecutiveSlots(slot, week!.slots)
        .filter((s) => !planFor(s, day.weekday))
        .map((s) => s.id);
      const plan = await api.post<PlanDTO>("/api/plans", { date: week!.days[day.weekday - 1], slotIds });
      router.push(`/piani/${plan.id}`);
    } catch (e) {
      toast(errorMessage(e), "error");
      setCreating(false);
    }
  }

  const unscheduled = week.plans.filter((p) => p.slotIds.length === 0);
  const isCurrentWeek = monday === mondayOf(now);

  return (
    <>
      <PageHeader
        title="Settimana"
        subtitle={weekTitle(week.days)}
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
          </>
        }
      />

      {week.slots.length === 0 ? (
        <EmptyState
          title="Il tuo orario è ancora vuoto"
          action={
            <Link href="/orario">
              <Button variant="primary">Inserisci l&apos;orario</Button>
            </Link>
          }
        >
          Inserisci le lezioni che tieni ogni settimana: qui potrai collegare un piano a ciascuna, con gli orari
          delle fasi calcolati in automatico.
        </EmptyState>
      ) : (
        <WeekGrid
          days={days}
          slots={week.slots}
          onSlotClick={openSlot}
          slotLabel={(s, d) => {
            const plan = planFor(s, d.weekday);
            return plan
              ? `Apri il piano "${plan.title || "Senza titolo"}" (${s.subject}, ${d.title} ${s.startTime})`
              : `Crea un piano per ${s.subject} ${s.className}, ${d.title} ${s.startTime}`;
          }}
          renderSlot={(s, d) => {
            const plan = planFor(s, d.weekday);
            return (
              <>
                <span className="block truncate font-semibold">
                  {s.subject}
                  {s.className && <span className="font-normal"> · {s.className}</span>}
                </span>
                <span className="tabular block opacity-75">
                  {s.startTime}–{s.endTime}
                </span>
                {plan ? (
                  <span className="mt-0.5 flex items-center gap-1 font-medium">
                    <FileText className="size-3 shrink-0" aria-hidden />
                    <span className="truncate">{plan.title || "Senza titolo"}</span>
                  </span>
                ) : (
                  <span className="mt-0.5 flex items-center gap-1 opacity-60">
                    <Plus className="size-3 shrink-0" aria-hidden />
                    Crea piano
                  </span>
                )}
              </>
            );
          }}
        />
      )}

      {unscheduled.length > 0 && (
        <section className="mt-6">
          <h2 className="mb-2 font-medium">Altri piani di questa settimana</h2>
          <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
            {unscheduled.map((p) => (
              <li key={p.id}>
                <Link href={`/piani/${p.id}`} className="flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-sunken">
                  <span className="truncate font-medium">{p.title || "Senza titolo"}</span>
                  <span className="shrink-0 text-muted">
                    {p.date && humanDate(p.date, { weekday: true, year: false })} · {p.totalMin}&apos;
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
