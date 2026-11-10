"use client";

import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Copy, GripVertical, Minus, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { splitMaterials } from "@/lib/plan-utils";
import { fromMin, type PhaseTiming, type Schedule } from "@/lib/schedule";
import type { PhaseDTO, PhaseTemplateDTO } from "@/lib/types";
import { AutoTextarea, cx, IconButton } from "./ui";

const GRID = "grid grid-cols-[172px_minmax(0,1fr)_minmax(0,1.7fr)_minmax(0,1fr)_minmax(0,0.8fr)_30px]";

export const newPhase = (t?: Partial<PhaseDTO>): PhaseDTO => ({
  id: crypto.randomUUID(),
  name: "",
  modality: "",
  durationMin: 10,
  obiettiviSpecifici: "",
  descrizione: "",
  prodottoAtteso: "",
  materiale: "",
  ...t,
});

function PhaseRow({
  phase,
  timing,
  hasClock,
  suggestions,
  onChange,
  onDuplicate,
  onDelete,
}: {
  phase: PhaseDTO;
  timing: PhaseTiming | undefined;
  hasClock: boolean;
  suggestions: string[];
  onChange: (patch: Partial<PhaseDTO>) => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: phase.id });
  const [materialFocus, setMaterialFocus] = useState(false);

  const used = new Set(splitMaterials(phase.materiale).map((m) => m.toLowerCase()));
  const chips = materialFocus ? suggestions.filter((s) => !used.has(s.toLowerCase())).slice(0, 5) : [];
  const setDuration = (n: number) => onChange({ durationMin: Math.max(0, Math.min(600, Math.round(n) || 0)) });
  const label = phase.name || "fase senza nome";

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cx(
        GRID,
        "group border-t border-line bg-surface",
        isDragging && "relative z-10 shadow-lg ring-1 ring-accent",
      )}
    >
      {/* Tempi e fasi */}
      <div className="flex gap-0.5 py-1.5 pl-0.5">
        <button
          type="button"
          className="mt-1 flex h-7 w-5 shrink-0 cursor-grab touch-none items-center justify-center rounded text-muted/60 hover:bg-sunken hover:text-ink active:cursor-grabbing"
          aria-label={`Sposta ${label}`}
          {...attributes}
          {...listeners}
        >
          <GripVertical className="size-4" />
        </button>
        <div className="min-w-0 flex-1">
          <input
            className="cell-input font-medium"
            value={phase.name}
            onChange={(e) => onChange({ name: e.target.value })}
            placeholder="Fase"
            aria-label="Nome della fase"
          />
          <input
            className="cell-input text-[13px] text-muted"
            value={phase.modality}
            onChange={(e) => onChange({ modality: e.target.value })}
            placeholder="modalità (es. frontale)"
            aria-label="Modalità"
          />
          <div className="mt-1 flex items-center gap-0.5 pl-1">
            <IconButton label="5 minuti in meno" className="size-6" onClick={() => setDuration(Math.max(5, phase.durationMin - 5))}>
              <Minus className="size-3.5" />
            </IconButton>
            <input
              type="number"
              min={0}
              max={600}
              className="tabular h-6 w-11 rounded border border-line-strong bg-surface text-center text-[13px] font-medium [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
              value={phase.durationMin}
              onChange={(e) => setDuration(Number(e.target.value))}
              aria-label="Durata in minuti"
            />
            <IconButton label="5 minuti in più" className="size-6" onClick={() => setDuration(phase.durationMin + 5)}>
              <Plus className="size-3.5" />
            </IconButton>
            <span className="text-xs text-muted">min</span>
          </div>
          {timing && (
            <p
              className={cx(
                "tabular mt-1 pl-1.5 font-mono text-xs",
                timing.overflow || timing.crossesBreak ? "text-warn" : "text-accent",
              )}
            >
              {hasClock
                ? `${fromMin(timing.start)}–${fromMin(timing.end)}`
                : `min ${timing.start}–${timing.end}`}
              {timing.overflow && <span className="block font-sans">oltre la durata prevista</span>}
              {timing.crossesBreak && <span className="block font-sans">a cavallo della pausa</span>}
            </p>
          )}
        </div>
      </div>

      <div className="border-l border-line p-1">
        <AutoTextarea
          className="cell-input"
          value={phase.obiettiviSpecifici}
          onChange={(e) => onChange({ obiettiviSpecifici: e.target.value })}
          placeholder="Cosa fa e impara l’allievo"
          aria-label="Obiettivi specifici d’apprendimento"
          minRows={3}
        />
      </div>
      <div className="border-l border-line p-1">
        <AutoTextarea
          className="cell-input"
          value={phase.descrizione}
          onChange={(e) => onChange({ descrizione: e.target.value })}
          placeholder="Cosa succede in questa fase"
          aria-label="Descrizione"
          minRows={3}
        />
      </div>
      <div className="border-l border-line p-1">
        <AutoTextarea
          className="cell-input"
          value={phase.prodottoAtteso}
          onChange={(e) => onChange({ prodottoAtteso: e.target.value })}
          aria-label="Prodotto atteso"
          minRows={3}
        />
      </div>
      <div className="border-l border-line p-1">
        <AutoTextarea
          className="cell-input"
          value={phase.materiale}
          onChange={(e) => onChange({ materiale: e.target.value })}
          onFocus={() => setMaterialFocus(true)}
          onBlur={() => setMaterialFocus(false)}
          aria-label="Materiale"
          minRows={2}
        />
        {chips.length > 0 && (
          <div className="flex flex-wrap gap-1 px-1 pb-1">
            {chips.map((s) => (
              <button
                key={s}
                type="button"
                // mousedown: il clic non deve togliere il fuoco al campo.
                onMouseDown={(e) => {
                  e.preventDefault();
                  onChange({ materiale: phase.materiale.trim() ? `${phase.materiale.trim()}, ${s}` : s });
                }}
                className="rounded-full border border-line-strong px-2 py-0.5 text-xs text-muted hover:border-accent hover:text-accent"
              >
                + {s}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex flex-col items-center gap-0.5 border-l border-line py-1.5 opacity-40 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
        <IconButton label={`Duplica ${label}`} className="size-6" onClick={onDuplicate}>
          <Copy className="size-3.5" />
        </IconButton>
        <IconButton label={`Elimina ${label}`} className="size-6 hover:bg-danger-soft hover:text-danger" onClick={onDelete}>
          <Trash2 className="size-3.5" />
        </IconButton>
      </div>
    </div>
  );
}

export function PhaseTable({
  phases,
  schedule,
  templates,
  suggestions,
  onChange,
}: {
  phases: PhaseDTO[];
  schedule: Schedule;
  templates: PhaseTemplateDTO[];
  suggestions: string[];
  onChange: (phases: PhaseDTO[]) => void;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function onDragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return;
    const from = phases.findIndex((p) => p.id === active.id);
    const to = phases.findIndex((p) => p.id === over.id);
    onChange(arrayMove(phases, from, to));
  }

  const patch = (id: string, p: Partial<PhaseDTO>) => onChange(phases.map((x) => (x.id === id ? { ...x, ...p } : x)));
  const add = (t?: Partial<PhaseDTO>) => onChange([...phases, newPhase(t)]);

  return (
    <div>
      <div className="overflow-x-auto rounded-xl border border-line-strong bg-surface">
        <div className="min-w-[1020px]">
          <div className={cx(GRID, "bg-sunken text-[13px] font-semibold")}>
            <div className="px-3 py-2">Tempi e fasi</div>
            <div className="border-l border-line px-3 py-2">Obiettivi specifici d’apprendimento</div>
            <div className="border-l border-line px-3 py-2">Descrizione</div>
            <div className="border-l border-line px-3 py-2" title="Comportamenti e prodotti attesi dagli allievi che mostrano lo sviluppo delle competenze in gioco.">
              Prodotto atteso
            </div>
            <div className="border-l border-line px-3 py-2">Materiale</div>
            <div className="border-l border-line" />
          </div>

          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext items={phases.map((p) => p.id)} strategy={verticalListSortingStrategy}>
              {phases.map((p, i) => (
                <PhaseRow
                  key={p.id}
                  phase={p}
                  timing={schedule.phases[i]}
                  hasClock={schedule.hasClock}
                  suggestions={suggestions}
                  onChange={(x) => patch(p.id, x)}
                  onDuplicate={() => {
                    const copy = newPhase({ ...p, id: crypto.randomUUID() });
                    onChange([...phases.slice(0, i + 1), copy, ...phases.slice(i + 1)]);
                  }}
                  onDelete={() => onChange(phases.filter((x) => x.id !== p.id))}
                />
              ))}
            </SortableContext>
          </DndContext>

          {phases.length === 0 && (
            <p className="border-t border-line px-4 py-8 text-center text-muted">
              Nessuna fase. Aggiungine una qui sotto: gli orari si calcolano da soli.
            </p>
          )}
        </div>
      </div>

      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          onClick={() => add()}
          className="inline-flex h-7 items-center gap-1 rounded-full bg-accent px-3 text-[13px] font-medium text-white hover:bg-accent-hover"
        >
          <Plus className="size-3.5" /> Fase vuota
        </button>
        {templates.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => add({ name: t.name, modality: t.modality, durationMin: t.durationMin })}
            className="tabular inline-flex h-7 items-center gap-1 rounded-full border border-line-strong bg-surface px-2.5 text-[13px] hover:border-accent hover:text-accent"
            title={`Aggiungi "${t.name}"${t.modality ? ` (${t.modality})` : ""}, ${t.durationMin} minuti`}
          >
            <Plus className="size-3 opacity-60" />
            {t.name}
            <span className="text-muted">{t.durationMin}’</span>
          </button>
        ))}
      </div>
    </div>
  );
}
