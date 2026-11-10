"use client";

import { AlertTriangle, CheckCircle2, Wand2 } from "lucide-react";
import { fromMin, type Schedule } from "@/lib/schedule";
import type { PhaseDTO } from "@/lib/types";
import { Button, cx } from "./ui";

/** Riepilogo dei tempi: minuti pianificati rispetto alla lezione, con avvisi. */
export function TimeBar({
  phases,
  schedule,
  onRedistribute,
}: {
  phases: PhaseDTO[];
  schedule: Schedule;
  onRedistribute: () => void;
}) {
  const { total, available, diff, hasClock } = schedule;
  const scale = Math.max(total, available ?? 0, 1);
  const crossing = phases.filter((_, i) => schedule.phases[i]?.crossesBreak);
  const last = schedule.phases[schedule.phases.length - 1];

  let tone: "ok" | "warn" | "neutral" = "neutral";
  let message: string;
  if (phases.length === 0) {
    message = available ? `Lezione di ${available}’: aggiungi le fasi.` : "Aggiungi le fasi per vedere i tempi.";
  } else if (available === null || diff === null) {
    message = hasClock
      ? `${total}’ pianificati, fino alle ${fromMin(last.end)}.`
      : `Durata totale ${total}’. Indica la durata prevista o collega una lezione.`;
  } else if (diff === 0) {
    tone = "ok";
    message = `${total}’ su ${available}’: la lezione è piena.`;
  } else if (diff > 0) {
    tone = "warn";
    message = `${total}’ su ${available}’: restano ${diff}’ liberi.`;
  } else {
    // Sforare è ammesso: è un'informazione, non un errore.
    tone = "warn";
    message = `${total}’ su ${available}’: ${-diff}’ oltre la durata prevista.`;
  }

  const Icon = tone === "ok" ? CheckCircle2 : AlertTriangle;

  return (
    <div className="rounded-xl border border-line bg-surface p-3">
      <div className="flex h-7 overflow-hidden rounded-md bg-sunken" aria-hidden>
        {phases.map((p, i) => {
          const t = schedule.phases[i];
          return (
            <div
              key={p.id}
              title={`${p.name || "Fase"} · ${p.durationMin}’`}
              className={cx(
                "tabular flex items-center justify-center overflow-hidden border-r border-surface text-xs font-medium text-white",
                t?.overflow ? "bg-warn" : i % 2 ? "bg-accent/75" : "bg-accent",
              )}
              style={{ width: `${(p.durationMin / scale) * 100}%` }}
            >
              {p.durationMin / scale > 0.05 && `${p.durationMin}’`}
            </div>
          );
        })}
      </div>

      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <p
          role="status"
          className={cx(
            "flex items-center gap-1.5 font-medium",
            tone === "ok" && "text-ok",
            tone === "warn" && "text-warn",
          )}
        >
          {tone !== "neutral" && <Icon className="size-4 shrink-0" aria-hidden />}
          {message}
        </p>
        {diff !== null && diff !== 0 && phases.length > 0 && (
          <Button size="sm" onClick={onRedistribute} title="Adatta le durate delle fasi, in proporzione, per riempire esattamente la lezione">
            <Wand2 className="size-3.5" /> Ridistribuisci
          </Button>
        )}
      </div>
      {crossing.length > 0 && (
        <p className="mt-1 text-[13px] text-warn">
          {crossing.length === 1
            ? `La fase «${crossing[0].name || "senza nome"}» è a cavallo della pausa.`
            : `${crossing.length} fasi sono a cavallo della pausa.`}
        </p>
      )}
    </div>
  );
}
