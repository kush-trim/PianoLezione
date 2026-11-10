"use client";

import type { MouseEvent, ReactNode } from "react";
import { swatch } from "@/lib/colors";
import { fromMin, toMin } from "@/lib/schedule";
import type { SlotDTO } from "@/lib/types";
import { cx } from "./ui";

const PX_PER_MIN = 1.35;

export type DayColumn = {
  weekday: number; // 1..7
  title: string;
  subtitle?: string;
  highlight?: boolean;
};

/**
 * Griglia settimanale: colonne = giorni, righe = orari.
 * Usata sia per l'orario di insegnamento sia per la vista della settimana.
 */
export function WeekGrid({
  days,
  slots,
  renderSlot,
  onSlotClick,
  onEmptyClick,
  slotLabel,
}: {
  days: DayColumn[];
  slots: SlotDTO[];
  renderSlot: (slot: SlotDTO, day: DayColumn) => ReactNode;
  onSlotClick: (slot: SlotDTO, day: DayColumn) => void;
  /** Clic su uno spazio vuoto: riceve giorno e orario (arrotondato a 5'). */
  onEmptyClick?: (weekday: number, time: string) => void;
  slotLabel: (slot: SlotDTO, day: DayColumn) => string;
}) {
  // Sabato e domenica compaiono solo se ci sono lezioni.
  const lastDay = Math.max(5, ...slots.map((s) => s.weekday));
  const visible = days.filter((d) => d.weekday <= lastDay);

  const startHour = slots.length ? Math.floor(Math.min(...slots.map((s) => toMin(s.startTime))) / 60) : 8;
  const endHour = slots.length ? Math.ceil(Math.max(...slots.map((s) => toMin(s.endTime))) / 60) : 17;
  const from = Math.min(startHour, 8) * 60;
  const to = Math.max(endHour, startHour + 6) * 60;
  const height = (to - from) * PX_PER_MIN;
  const hours = Array.from({ length: (to - from) / 60 + 1 }, (_, i) => from + i * 60);

  function emptyClick(e: MouseEvent<HTMLDivElement>, weekday: number) {
    if (!onEmptyClick || e.target !== e.currentTarget) return;
    const y = e.clientY - e.currentTarget.getBoundingClientRect().top;
    const minute = Math.min(to - 45, from + Math.floor(y / PX_PER_MIN / 15) * 15);
    onEmptyClick(weekday, fromMin(minute));
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-line bg-surface">
      <div
        className="grid min-w-[640px]"
        style={{ gridTemplateColumns: `52px repeat(${visible.length}, minmax(112px, 1fr))` }}
      >
        {/* Intestazione: giorni */}
        <div className="border-b border-line" />
        {visible.map((d) => (
          <div
            key={d.weekday}
            className={cx(
              "border-b border-l border-line px-2 py-2 text-center",
              d.highlight && "bg-accent-soft",
            )}
          >
            <p className={cx("font-medium", d.highlight && "text-accent")}>{d.title}</p>
            {d.subtitle && <p className="text-xs text-muted">{d.subtitle}</p>}
          </div>
        ))}

        {/* Colonna degli orari */}
        <div className="relative" style={{ height }}>
          {hours.slice(0, -1).map((h) => (
            <span
              key={h}
              className="tabular absolute right-2 -translate-y-1/2 text-xs text-muted first:translate-y-0.5"
              style={{ top: (h - from) * PX_PER_MIN }}
            >
              {fromMin(h)}
            </span>
          ))}
        </div>

        {/* Colonne dei giorni */}
        {visible.map((d) => (
          <div
            key={d.weekday}
            className={cx("relative border-l border-line", onEmptyClick && "cursor-cell")}
            style={{
              height,
              backgroundImage: "linear-gradient(to bottom, var(--line) 1px, transparent 1px)",
              backgroundSize: `100% ${60 * PX_PER_MIN}px`,
            }}
            onClick={(e) => emptyClick(e, d.weekday)}
          >
            {slots
              .filter((s) => s.weekday === d.weekday)
              .map((s) => {
                const c = swatch(s.color);
                const top = (toMin(s.startTime) - from) * PX_PER_MIN;
                const h = (toMin(s.endTime) - toMin(s.startTime)) * PX_PER_MIN;
                return (
                  <button
                    key={s.id}
                    type="button"
                    aria-label={slotLabel(s, d)}
                    onClick={() => onSlotClick(s, d)}
                    className="absolute inset-x-1 overflow-hidden rounded-md border px-1.5 py-1 text-left text-xs leading-snug transition-shadow hover:shadow-md"
                    style={{
                      top: top + 1,
                      height: Math.max(h - 2, 22),
                      background: c.bg,
                      borderColor: c.border,
                      color: c.text,
                    }}
                  >
                    {renderSlot(s, d)}
                  </button>
                );
              })}
          </div>
        ))}
      </div>
    </div>
  );
}
