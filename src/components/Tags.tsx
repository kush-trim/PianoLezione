"use client";

import { Check, Plus } from "lucide-react";
import { useState } from "react";
import { MAX_TAG_LENGTH, MAX_TAGS, normalizeTags, PRESET_TAGS, sortTags, tagClass, tagKey } from "@/lib/tags";
import { Button, cx, Input } from "./ui";

/** Un'etichetta, con il suo colore (label: testo diverso dal nome, es. con il conteggio). */
export function TagChip({ tag, label, small }: { tag: string; label?: string; small?: boolean }) {
  return (
    <span className={cx("inline-flex items-center rounded-full font-medium", small ? "px-1.5 py-px text-[11px]" : "px-2 py-0.5 text-xs", tagClass(tag))}>
      {label ?? tag}
    </span>
  );
}

export function TagList({ tags, small }: { tags: string[]; small?: boolean }) {
  if (!tags.length) return null;
  return (
    <span className="inline-flex flex-wrap gap-1">
      {tags.map((t) => (
        <TagChip key={t} tag={t} small={small} />
      ))}
    </span>
  );
}

/**
 * Scelta delle etichette: le quattro pronte, quelle già usate negli altri file e una nuova a mano.
 * Si attivano e disattivano con un clic.
 */
export function TagEditor({ value, onChange, used = [] }: { value: string[]; onChange: (tags: string[]) => void; used?: string[] }) {
  const [draft, setDraft] = useState("");
  const on = new Set(value.map(tagKey));
  const presetKeys = new Set(PRESET_TAGS.map((p) => tagKey(p.name)));
  const others = sortTags(normalizeTags([...used, ...value]).filter((t) => !presetKeys.has(tagKey(t))));
  const full = value.length >= MAX_TAGS;

  const toggle = (t: string) => onChange(on.has(tagKey(t)) ? value.filter((v) => tagKey(v) !== tagKey(t)) : normalizeTags([...value, t]));
  const add = () => {
    if (!draft.trim()) return;
    onChange(normalizeTags([...value, draft]));
    setDraft("");
  };

  const chip = (t: string, hint?: string) => {
    const active = on.has(tagKey(t));
    return (
      <button
        key={t}
        type="button"
        onClick={() => toggle(t)}
        aria-pressed={active}
        disabled={!active && full}
        title={hint}
        className={cx(
          "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[13px] transition-colors disabled:opacity-50",
          active ? cx("border-transparent font-medium", tagClass(t)) : "border-line-strong text-muted hover:border-accent hover:text-ink",
        )}
      >
        {active && <Check className="size-3" aria-hidden />}
        {t}
      </button>
    );
  };

  return (
    <div className="space-y-3">
      <div>
        <div className="flex flex-wrap gap-1.5">{PRESET_TAGS.map((p) => chip(p.name, p.hint))}</div>
        <p className="mt-1.5 text-[13px] text-muted">
          {PRESET_TAGS.map((p) => (
            <span key={p.name} className="mr-3 inline-block">
              <span className="font-medium text-ink">{p.name}</span>: {p.hint}
            </span>
          ))}
        </p>
      </div>
      {others.length > 0 && (
        <div>
          <p className="mb-1.5 text-[13px] text-muted">Altre etichette</p>
          <div className="flex flex-wrap gap-1.5">{others.map((t) => chip(t))}</div>
        </div>
      )}
      <div className="flex gap-2">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          maxLength={MAX_TAG_LENGTH}
          placeholder="Nuova etichetta, es. Verifica"
          aria-label="Nuova etichetta"
          disabled={full}
        />
        <Button onClick={add} disabled={!draft.trim() || full}>
          <Plus className="size-4" /> Aggiungi
        </Button>
      </div>
      {full && <p className="text-[13px] text-muted">Al massimo {MAX_TAGS} etichette per file.</p>}
    </div>
  );
}
