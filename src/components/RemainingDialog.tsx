"use client";

import { useEffect, useState } from "react";
import { api, errorMessage } from "@/lib/api";
import { swatch } from "@/lib/colors";
import { humanDate, parseDate } from "@/lib/plan-utils";
import type { RemainingDTO } from "@/lib/types";
import { Dialog, ErrorNote, Loading } from "./ui";

const hours = (min: number, lessonMinutes: number) => {
  const h = min / lessonMinutes;
  return Number.isInteger(h) ? String(h) : h.toFixed(1).replace(".", ",");
};

/** Quanto manca alla fine dell'anno scolastico, per ogni classe (o solo per quella scelta). */
export function RemainingDialog({
  open,
  onClose,
  className,
  lessonMinutes,
}: {
  open: boolean;
  onClose: () => void;
  /** Classe scelta nel filtro della settimana; "" = tutte. */
  className: string;
  lessonMinutes: number;
}) {
  const [data, setData] = useState<RemainingDTO | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    let stale = false;
    api.get<RemainingDTO>("/api/classes/remaining").then(
      (d) => !stale && (setData(d), setError("")),
      (e) => !stale && setError(errorMessage(e)),
    );
    return () => {
      stale = true;
    };
  }, [open]);

  const rows = data?.classes.filter((c) => !className || c.className === className) ?? [];
  const title = className ? `Fine dell'anno · ${className}` : "Fine dell'anno";

  return (
    <Dialog open={open} onClose={onClose} title={title} wide>
      <ErrorNote>{error}</ErrorNote>
      {!data && !error && <Loading />}
      {data && !data.year && <p className="text-muted">Nessun anno scolastico definito: impostalo nelle Impostazioni.</p>}
      {data?.year && (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-2 text-center">
            {[
              [data.schoolDaysLeft, data.schoolDaysLeft === 1 ? "giorno di scuola" : "giorni di scuola"],
              [data.weeksLeft, data.weeksLeft === 1 ? "settimana" : "settimane"],
              [parseDate(data.year.endDate).toLocaleDateString("it-CH", { day: "numeric", month: "short" }), "ultimo giorno"],
            ].map(([n, label]) => (
              <div key={label} className="rounded-lg bg-sunken px-2 py-2.5">
                <p className="tabular font-display text-2xl font-semibold">{n}</p>
                <p className="text-[13px] text-muted">{label}</p>
              </div>
            ))}
          </div>

          {rows.length === 0 ? (
            <p className="text-muted">
              {className ? `Nessuna lezione della classe ${className} da qui alla fine dell'anno.` : "Nessuna lezione nell'orario."}
            </p>
          ) : (
            <ul className="divide-y divide-line rounded-lg border border-line">
              {rows.map((c) => {
                const pct = c.remaining ? Math.round((c.planned / c.remaining) * 100) : 0;
                return (
                  <li key={`${c.className}|${c.subject}`} className="px-3 py-2.5">
                    <div className="flex items-baseline gap-2">
                      <span className="size-2.5 shrink-0 self-center rounded-full" style={{ background: swatch(c.color).solid }} aria-hidden />
                      <span className="font-medium">
                        {c.className || "Senza classe"} · {c.subject}
                      </span>
                      <span className="tabular ml-auto font-semibold">
                        {c.remaining} {c.remaining === 1 ? "lezione" : "lezioni"}
                      </span>
                    </div>
                    <p className="tabular mt-0.5 pl-4.5 text-[13px] text-muted">
                      {hours(c.remainingMin, lessonMinutes)} ore in {c.daysLeft} {c.daysLeft === 1 ? "giorno" : "giorni"}
                      {c.nextDate && ` · prossima ${humanDate(c.nextDate, { weekday: true, year: false })}`}
                      {` · già fatte ${c.done}`}
                    </p>
                    <div className="mt-1.5 ml-4.5 flex items-center gap-2">
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-sunken" aria-hidden>
                        <div className="h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="tabular shrink-0 text-xs text-muted">
                        {c.planned}/{c.remaining} con il piano
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          <p className="text-xs text-muted">
            Contano le lezioni da oggi a fine anno, senza vacanze, lezioni annullate e giornate speciali che le tolgono.
          </p>
        </div>
      )}
    </Dialog>
  );
}
