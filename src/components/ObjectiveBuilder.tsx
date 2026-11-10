"use client";

import { Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { SUBJECT } from "@/lib/plan-utils";
import type { Obiettivo, VerbDTO, VerbKind } from "@/lib/types";
import { AutoTextarea, Button, IconButton } from "./ui";

/**
 * Obiettivi scritti in forma fissa: soggetto + verbo scelto dall'elenco + testo.
 * Il verbo non si può scrivere a mano: l'elenco si gestisce nelle Impostazioni.
 */
export function ObjectiveBuilder({
  kind,
  label,
  items,
  legacyText,
  verbs,
  onChange,
  onClearLegacy,
}: {
  kind: VerbKind;
  label: string;
  items: Obiettivo[];
  /** Testo libero scritto prima degli obiettivi strutturati. */
  legacyText: string;
  verbs: VerbDTO[];
  onChange: (items: Obiettivo[]) => void;
  onClearLegacy: () => void;
}) {
  const options = verbs.filter((v) => v.kind === kind).map((v) => v.text);
  const patch = (id: string, p: Partial<Obiettivo>) => onChange(items.map((o) => (o.id === id ? { ...o, ...p } : o)));
  const add = () => onChange([...items, { id: crypto.randomUUID(), verbo: "", testo: "" }]);
  const showLegacy = items.length === 0 && legacyText.trim() !== "";

  return (
    <section>
      <h2 className="font-semibold">{label}</h2>

      {showLegacy && (
        <div className="mt-1.5 rounded-md border border-dashed border-line-strong px-3 py-2">
          <p className="leading-relaxed whitespace-pre-line">{legacyText}</p>
          <p className="mt-2 flex flex-wrap items-center gap-2 text-[13px] text-muted">
            Testo libero. Per usare i verbi consigliati riscrivilo come elenco di obiettivi.
            <Button
              size="sm"
              onClick={() => {
                onClearLegacy();
                add();
              }}
            >
              Riscrivi con i verbi
            </Button>
          </p>
        </div>
      )}

      {items.length > 0 && (
        <ul className="mt-1.5 space-y-1.5">
          {items.map((o) => (
            <li key={o.id} className="flex flex-wrap items-start gap-2 sm:flex-nowrap">
              <span className="flex h-9 shrink-0 items-center text-muted">{SUBJECT[kind]}</span>
              <select
                value={o.verbo}
                onChange={(e) => patch(o.id, { verbo: e.target.value })}
                aria-label="Verbo"
                className={`h-9 max-w-[45%] shrink-0 rounded-md border border-line-strong bg-surface px-2 font-medium ${o.verbo ? "" : "text-muted"}`}
              >
                <option value="">scegli il verbo…</option>
                {options.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
                {o.verbo && !options.includes(o.verbo) && <option value={o.verbo}>{o.verbo} (non più in elenco)</option>}
              </select>
              <AutoTextarea
                value={o.testo}
                onChange={(e) => patch(o.id, { testo: e.target.value })}
                placeholder={kind === "insegnamento" ? "che cosa, a chi, come" : "che cosa sa fare alla fine"}
                aria-label="Testo dell’obiettivo"
                className="min-w-0 flex-1 resize-none max-sm:order-last max-sm:basis-full rounded-md border border-line-strong bg-surface px-2.5 py-[7px] leading-snug placeholder:text-muted/60"
              />
              <IconButton
                label="Elimina obiettivo"
                className="mt-1 hover:bg-danger-soft hover:text-danger"
                onClick={() => onChange(items.filter((x) => x.id !== o.id))}
              >
                <Trash2 className="size-4" />
              </IconButton>
            </li>
          ))}
        </ul>
      )}

      {!showLegacy && (
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <Button size="sm" onClick={add}>
            <Plus className="size-3.5" /> Aggiungi obiettivo
          </Button>
          {options.length === 0 && (
            <span className="text-[13px] text-muted">
              Nessun verbo in elenco:{" "}
              <Link href="/impostazioni" className="font-medium text-accent hover:underline">
                aggiungili nelle Impostazioni
              </Link>
            </span>
          )}
        </div>
      )}
    </section>
  );
}
