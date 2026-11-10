"use client";

import { useLayoutEffect, useRef, useState, type MouseEvent, type ReactNode } from "react";
import { swatch } from "@/lib/colors";
import { fromMin, toMin } from "@/lib/schedule";
import { cx } from "./ui";

const PX_PER_MIN = 1.35;
// Con `fit` la scala si adatta all'altezza disponibile, entro questi limiti.
const MIN_PX_PER_MIN = 0.62;
const MAX_PX_PER_MIN = 2.2;

export type DayColumn = {
  weekday: number; // 1..7
  title: string;
  subtitle?: string;
  highlight?: boolean;
  /** Giorno senza scuola (vacanza): colonna ombreggiata. */
  shaded?: boolean;
  /** Note del giorno sotto l'intestazione: vacanze, eventi di giornata intera. */
  notes?: ReactNode;
};

export type GridBlock = {
  key: string;
  weekday: number;
  start: string; // "HH:MM"
  end: string;
  color: string;
  label: string;
  content: ReactNode;
  onClick?: () => void;
  /** Lezione annullata: resta visibile ma spenta. */
  muted?: boolean;
  /** Evento (non una lezione ricorrente): bordo tratteggiato. */
  dashed?: boolean;
};

/** Assegna una corsia ai blocchi che si sovrappongono, così restano affiancati. */
function layout(blocks: GridBlock[]): { block: GridBlock; lane: number; lanes: number }[] {
  const sorted = [...blocks].sort((a, b) => toMin(a.start) - toMin(b.start) || toMin(b.end) - toMin(a.end));
  const out: { block: GridBlock; lane: number; lanes: number }[] = [];
  let cluster: typeof out = [];
  let clusterEnd = -1;
  let laneEnds: number[] = [];
  const flush = () => {
    for (const item of cluster) item.lanes = laneEnds.length;
    out.push(...cluster);
    cluster = [];
    laneEnds = [];
  };
  for (const block of sorted) {
    const start = toMin(block.start);
    if (cluster.length && start >= clusterEnd) flush();
    let lane = laneEnds.findIndex((end) => end <= start);
    if (lane === -1) lane = laneEnds.length;
    laneEnds[lane] = toMin(block.end);
    clusterEnd = Math.max(clusterEnd, toMin(block.end));
    cluster.push({ block, lane, lanes: 1 });
  }
  flush();
  return out;
}

/** Griglia settimanale: colonne = giorni, righe = orari. */
export function WeekGrid({
  days,
  blocks,
  onEmptyClick,
  fit = false,
}: {
  days: DayColumn[];
  blocks: GridBlock[];
  /** Clic su uno spazio vuoto: riceve giorno e orario (arrotondato a 15'). */
  onEmptyClick?: (weekday: number, time: string) => void;
  /** Riempie l'altezza del contenitore: la giornata intera si vede senza scorrere. */
  fit?: boolean;
}) {
  const bodyRef = useRef<HTMLDivElement>(null);
  const [bodyHeight, setBodyHeight] = useState(0);
  useLayoutEffect(() => {
    const el = bodyRef.current;
    if (!fit || !el) return;
    const ro = new ResizeObserver(() => setBodyHeight(el.clientHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, [fit]);

  // Sabato e domenica compaiono solo se c'è qualcosa (una vacanza che li copre non basta).
  const lastDay = Math.max(5, ...blocks.map((b) => b.weekday), ...days.filter((d) => d.notes && !d.shaded).map((d) => d.weekday));
  const visible = days.filter((d) => d.weekday <= lastDay);

  const startHour = blocks.length ? Math.floor(Math.min(...blocks.map((b) => toMin(b.start))) / 60) : 8;
  const endHour = blocks.length ? Math.ceil(Math.max(...blocks.map((b) => toMin(b.end))) / 60) : 17;
  const from = Math.min(startHour, 8) * 60;
  const to = Math.max(endHour, startHour + 6, 16) * 60;
  const scale =
    fit && bodyHeight > 0
      ? Math.min(MAX_PX_PER_MIN, Math.max(MIN_PX_PER_MIN, (bodyHeight - 2) / (to - from)))
      : PX_PER_MIN;
  const height = (to - from) * scale;
  const hours = Array.from({ length: (to - from) / 60 + 1 }, (_, i) => from + i * 60);
  const hasNotes = visible.some((d) => d.notes);

  function emptyClick(e: MouseEvent<HTMLDivElement>, weekday: number) {
    if (!onEmptyClick || e.target !== e.currentTarget) return;
    const y = e.clientY - e.currentTarget.getBoundingClientRect().top;
    const minute = Math.min(to - 45, from + Math.floor(y / scale / 15) * 15);
    onEmptyClick(weekday, fromMin(minute));
  }

  const columns = { gridTemplateColumns: `52px repeat(${visible.length}, minmax(112px, 1fr))` };
  // La barra di scorrimento verticale del corpo non deve disallineare le colonne dell'intestazione.
  const gutter = { scrollbarGutter: "stable" } as const;

  return (
    <div className={cx("overflow-x-auto rounded-xl border border-line bg-surface", fit && "flex min-h-0 flex-1 flex-col")}>
      <div className={cx("min-w-[640px]", fit && "flex min-h-0 flex-1 flex-col")}>
        <div className="grid overflow-hidden" style={{ ...columns, ...gutter }}>
          {/* Intestazione: giorni */}
          <div className="border-b border-line" />
          {visible.map((d) => (
            <div
              key={d.weekday}
              className={cx("border-b border-l border-line px-2 py-1.5 text-center", d.highlight && "bg-accent-soft")}
            >
              <p className={cx("font-medium", d.highlight && "text-accent")}>{d.title}</p>
              {d.subtitle && <p className="text-xs text-muted">{d.subtitle}</p>}
            </div>
          ))}

          {/* Note del giorno: vacanze ed eventi di giornata intera */}
          {hasNotes && (
            <>
              <div className="border-b border-line" />
              {visible.map((d) => (
                <div
                  key={d.weekday}
                  className="flex flex-col gap-1 border-b border-l border-line p-1"
                  style={{ backgroundColor: d.shaded ? "var(--sunken)" : undefined }}
                >
                  {d.notes}
                </div>
              ))}
            </>
          )}
        </div>

        <div
          ref={bodyRef}
          className={cx("grid", fit && "min-h-0 flex-1 overflow-y-auto")}
          style={{ ...columns, ...gutter, alignContent: "start" }}
        >
          {/* Colonna degli orari */}
          <div className="relative" style={{ height }}>
            {hours.slice(0, -1).map((h) => (
              <span
                key={h}
                className="tabular absolute right-2 -translate-y-1/2 text-xs text-muted first:translate-y-0.5"
                style={{ top: (h - from) * scale }}
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
                backgroundColor: d.shaded ? "var(--sunken)" : undefined,
                backgroundImage: "linear-gradient(to bottom, var(--line) 1px, transparent 1px)",
                backgroundSize: `100% ${60 * scale}px`,
              }}
              onClick={(e) => emptyClick(e, d.weekday)}
            >
              {layout(blocks.filter((b) => b.weekday === d.weekday)).map(({ block: b, lane, lanes }) => {
                const c = swatch(b.color);
                const top = (toMin(b.start) - from) * scale;
                const h = (toMin(b.end) - toMin(b.start)) * scale;
                const style = {
                  top: top + 1,
                  height: Math.max(h - 2, 22),
                  left: `calc(${(lane / lanes) * 100}% + 3px)`,
                  width: `calc(${100 / lanes}% - 6px)`,
                  background: b.muted ? "var(--surface)" : c.bg,
                  borderColor: c.border,
                  color: c.text,
                };
                const className = cx(
                  "absolute overflow-hidden rounded-md border px-1.5 py-1 text-left text-xs leading-snug",
                  b.dashed && "border-dashed",
                  b.muted && "opacity-60",
                );
                return b.onClick ? (
                  <button
                    key={b.key}
                    type="button"
                    aria-label={b.label}
                    onClick={b.onClick}
                    className={cx(className, "transition-shadow hover:shadow-md")}
                    style={style}
                  >
                    {b.content}
                  </button>
                ) : (
                  <div key={b.key} title={b.label} className={className} style={style}>
                    {b.content}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
