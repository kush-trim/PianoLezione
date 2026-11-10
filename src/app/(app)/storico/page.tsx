"use client";

import { FileText, History } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Button, EmptyState, Loading, PageHeader, useToast } from "@/components/ui";
import { VersionsDialog } from "@/components/VersionsDialog";
import { api, errorMessage } from "@/lib/api";
import { addDays, formatDate, humanDate, today } from "@/lib/plan-utils";
import type { PlanSummary } from "@/lib/types";

function dayLabel(day: string) {
  const now = today();
  if (day === now) return "Oggi";
  if (day === addDays(now, -1)) return "Ieri";
  return humanDate(day, { weekday: true });
}

export default function StoricoPage() {
  const toast = useToast();
  const [plans, setPlans] = useState<PlanSummary[] | null>(null);
  const [versionsOf, setVersionsOf] = useState<string | null>(null);

  const load = useCallback(
    () => api.get<PlanSummary[]>("/api/plans?limit=150").then(setPlans, (e) => toast(errorMessage(e), "error")),
    [toast],
  );
  useEffect(() => {
    load();
  }, [load]);

  if (!plans) return <Loading />;

  // Raggruppa per giorno dell'ultima modifica (i piani arrivano già dal più recente).
  const groups: { day: string; plans: PlanSummary[] }[] = [];
  for (const p of plans) {
    const day = formatDate(new Date(p.updatedAt));
    const last = groups[groups.length - 1];
    if (last?.day === day) last.plans.push(p);
    else groups.push({ day, plans: [p] });
  }

  return (
    <>
      <PageHeader title="Storico" subtitle="I piani su cui hai lavorato, dal più recente, con le versioni precedenti." />

      {groups.length === 0 ? (
        <EmptyState title="Ancora nessun piano">Qui troverai la cronologia del tuo lavoro.</EmptyState>
      ) : (
        <div className="max-w-3xl space-y-6">
          {groups.map((g) => (
            <section key={g.day}>
              <h2 className="mb-2 text-[13px] font-semibold tracking-wide text-muted uppercase">{dayLabel(g.day)}</h2>
              <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
                {g.plans.map((p) => (
                  <li key={p.id} className="flex items-center gap-3 px-3 py-2.5">
                    <span className="tabular w-11 shrink-0 text-[13px] text-muted">
                      {new Date(p.updatedAt).toLocaleTimeString("it-CH", { hour: "2-digit", minute: "2-digit" })}
                    </span>
                    <FileText className="size-4 shrink-0 text-muted" aria-hidden />
                    <Link href={`/piani/${p.id}`} className="min-w-0 flex-1 hover:underline">
                      <span className="block truncate font-medium">{p.title || "Senza titolo"}</span>
                      <span className="block truncate text-[13px] text-muted">
                        {p.date ? `Lezione del ${humanDate(p.date)}` : "Senza data"} · {p.phaseCount}{" "}
                        {p.phaseCount === 1 ? "fase" : "fasi"} · {p.totalMin}’
                      </span>
                    </Link>
                    <Button size="sm" variant="ghost" onClick={() => setVersionsOf(p.id)}>
                      <History className="size-3.5" /> Versioni
                    </Button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      <VersionsDialog
        planId={versionsOf}
        onClose={() => setVersionsOf(null)}
        onRestored={() => {
          setVersionsOf(null);
          toast("Versione ripristinata");
          load();
        }}
      />
    </>
  );
}
