"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import type { YearWeek } from "@/lib/calendar";
import { addDays, mondayOf, parseDate, today } from "@/lib/plan-utils";
import type { SchoolYearDTO } from "@/lib/types";
import { cx } from "./ui";

export type YearData = {
  year: SchoolYearDTO | null;
  weeks: (YearWeek & { plans: number })[];
};

const monthName = (d: string) => parseDate(d).toLocaleDateString("it-CH", { month: "short" });

/** L'anno scolastico settimana per settimana: clic per saltare a una settimana. */
export function YearStrip({
  data,
  selected,
  onSelect,
}: {
  data: YearData;
  selected: string;
  onSelect: (monday: string) => void;
}) {
  const currentRef = useRef<HTMLButtonElement>(null);
  // La settimana selezionata resta visibile anche quando l'anno non sta tutto nella riga.
  useEffect(() => {
    currentRef.current?.scrollIntoView({ block: "nearest", inline: "center" });
  }, [selected, data.year?.id]);

  if (!data.year) {
    return (
      <p className="mb-3 rounded-xl border border-dashed border-line-strong px-4 py-3 text-muted">
        Nessun anno scolastico definito.{" "}
        <Link href="/impostazioni" className="font-medium text-accent hover:underline">
          Impostalo
        </Link>{" "}
        per vedere le settimane numerate.
      </p>
    );
  }

  const thisWeek = mondayOf(today());
  return (
    <nav aria-label={`Settimane dell'anno scolastico ${data.year.name}`} className="mb-3 shrink-0 rounded-xl border border-line bg-surface">
      <div className="flex items-end gap-0.5 overflow-x-auto px-2 pt-1.5 pb-2">
        <span className="sticky left-0 z-10 mr-1 shrink-0 self-stretch bg-surface pr-2 pt-4 text-[13px] font-semibold">
          {data.year.name}
        </span>
        {data.weeks.map((w, i) => {
          // Il mese si scrive sopra la prima settimana che vi cade.
          const thursday = addDays(w.monday, 3);
          const newMonth = i === 0 || monthName(addDays(data.weeks[i - 1].monday, 3)) !== monthName(thursday);
          const isSelected = w.monday === selected;
          const label = w.number
            ? `Settimana ${w.number}, dal ${parseDate(w.monday).toLocaleDateString("it-CH", { day: "numeric", month: "long" })}${w.plans ? `, ${w.plans} piani` : ""}`
            : `${w.holiday ?? "Vacanza"}, settimana del ${parseDate(w.monday).toLocaleDateString("it-CH", { day: "numeric", month: "long" })}`;
          return (
            <div key={w.monday} className="flex shrink-0 flex-col items-stretch">
              <span className="h-4 text-[10px] leading-4 text-muted uppercase">{newMonth ? monthName(thursday) : ""}</span>
              <button
                ref={isSelected ? currentRef : undefined}
                type="button"
                title={label}
                aria-label={label}
                aria-current={isSelected ? "true" : undefined}
                onClick={() => onSelect(w.monday)}
                className={cx(
                  "tabular relative h-7 w-7 rounded text-xs font-medium transition-colors",
                  isSelected
                    ? "bg-accent text-white"
                    : w.number === null
                      ? "bg-sunken text-muted/60 hover:text-ink"
                      : "hover:bg-accent-soft",
                  w.monday === thisWeek && !isSelected && "ring-1 ring-accent ring-inset",
                )}
              >
                {w.number ?? "·"}
                {w.plans > 0 && (
                  <span
                    className={cx("absolute bottom-0.5 left-1/2 size-1 -translate-x-1/2 rounded-full", isSelected ? "bg-white" : "bg-accent")}
                  />
                )}
              </button>
            </div>
          );
        })}
      </div>
    </nav>
  );
}
