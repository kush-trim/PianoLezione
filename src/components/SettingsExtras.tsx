"use client";

import { Check, Copy, Download, FileUp, Globe, KeyRound, Link2, Plus, Trash2, Type } from "lucide-react";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { api, errorMessage } from "@/lib/api";
import { humanDate } from "@/lib/plan-utils";
import { ticinoCalendarUrl } from "@/lib/school-calendar";
import type { ApiTokenDTO, CalendarImportDTO, HolidayDTO } from "@/lib/types";
import { Button, cx, ErrorNote, Field, IconButton, Input, inputClass, useToast } from "./ui";

const range = (a: string, b: string) => (a === b ? humanDate(a) : `${humanDate(a, { year: false })} – ${humanDate(b)}`);

function CopyField({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex gap-2">
      <input readOnly value={value} aria-label={label} className={cx(inputClass, "font-mono text-[13px]")} onFocus={(e) => e.target.select()} />
      <Button
        onClick={() =>
          navigator.clipboard.writeText(value).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          })
        }
      >
        {copied ? <Check className="size-4" /> : <Copy className="size-4" />} {copied ? "Copiato" : "Copia"}
      </Button>
    </div>
  );
}

// --- Importa anno scolastico e vacanze dal calendario ufficiale ---

type Source = "web" | "file" | "text";

export function CalendarImport({ holidays, onImported }: { holidays: HolidayDTO[]; onImported: () => void }) {
  const toast = useToast();
  // Proposto: l'anno scolastico in corso (da agosto quello che inizia quest'anno).
  const thisYear = new Date().getMonth() >= 7 ? new Date().getFullYear() : new Date().getFullYear() - 1;
  const [source, setSource] = useState<Source>("web");
  const [startYear, setStartYear] = useState(thisYear);
  const [url, setUrl] = useState(ticinoCalendarUrl(startYear));
  const [file, setFile] = useState<File | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<CalendarImportDTO | null>(null);
  const [year, setYear] = useState({ name: "", startDate: "", endDate: "" });
  const [skip, setSkip] = useState<Set<number>>(new Set());

  const exists = (h: { startDate: string; endDate: string }) =>
    holidays.some((x) => x.startDate === h.startDate && x.endDate === h.endDate);

  async function read(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setPreview(null);
    try {
      let result: CalendarImportDTO;
      if (source === "file") {
        if (!file) throw new Error("Scegli un file PDF");
        const form = new FormData();
        form.set("file", file);
        const res = await fetch("/api/school-years/import", { method: "POST", body: form });
        const data = await res.json().catch(() => null);
        if (!res.ok) throw new Error(data?.error ?? "Documento non leggibile");
        result = data;
      } else {
        result = await api.post<CalendarImportDTO>("/api/school-years/import", source === "web" ? { url } : { text });
      }
      setPreview(result);
      setYear(result.year ?? { name: "", startDate: "", endDate: "" });
      setSkip(new Set(result.holidays.flatMap((h, i) => (exists(h) ? [i] : []))));
    } catch (err) {
      setError(errorMessage(err));
    }
    setBusy(false);
  }

  async function apply() {
    if (!preview) return;
    setBusy(true);
    setError("");
    try {
      const r = await api.post<{ created: boolean; holidaysAdded: number; folderId: string | null }>("/api/school-years/import/apply", {
        year,
        holidays: preview.holidays.filter((_, i) => !skip.has(i)),
      });
      const parts = [
        r.created ? `Anno ${year.name} creato, con la cartella in Cartelle` : `Anno ${year.name} aggiornato`,
        `${r.holidaysAdded} ${r.holidaysAdded === 1 ? "vacanza aggiunta" : "vacanze aggiunte"}`,
      ];
      toast(parts.join(" · "));
      setPreview(null);
      onImported();
    } catch (err) {
      setError(errorMessage(err));
    }
    setBusy(false);
  }

  const tabs: [Source, string, typeof Globe][] = [
    ["web", "Dal sito del Cantone", Globe],
    ["file", "Carica un PDF", FileUp],
    ["text", "Incolla il testo", Type],
  ];

  return (
    <div className="mt-6 rounded-lg border border-line bg-sunken/50 p-4">
      <h3 className="font-medium">Importa dal calendario scolastico ufficiale</h3>
      <p className="mb-3 text-[13px] text-muted">
        Legge inizio e fine delle lezioni, i periodi di vacanza e i giorni festivi. Prima di salvare puoi controllare e togliere le voci che non ti servono.
      </p>
      <div role="tablist" className="mb-3 flex flex-wrap gap-1.5">
        {tabs.map(([key, label, Icon]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={source === key}
            onClick={() => setSource(key)}
            className={cx(
              "flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-[13px]",
              source === key ? "border-accent bg-accent-soft font-medium text-accent" : "border-line-strong bg-surface hover:border-accent",
            )}
          >
            <Icon className="size-3.5" aria-hidden /> {label}
          </button>
        ))}
      </div>

      <form onSubmit={read} className="space-y-3">
        {source === "web" && (
          <div className="flex flex-wrap items-end gap-2">
            <Field label="Anno scolastico" className="w-36">
              <select
                className={inputClass}
                value={startYear}
                onChange={(e) => {
                  const y = Number(e.target.value);
                  setStartYear(y);
                  setUrl(ticinoCalendarUrl(y));
                }}
              >
                {[-1, 0, 1, 2].map((d) => (
                  <option key={d} value={thisYear + d}>
                    {thisYear + d}/{String(thisYear + d + 1).slice(2)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Indirizzo del PDF" className="min-w-64 flex-1">
              <Input value={url} onChange={(e) => setUrl(e.target.value)} required />
            </Field>
          </div>
        )}
        {source === "file" && (
          <Field label="PDF del calendario">
            <input
              type="file"
              accept="application/pdf,.pdf"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="block text-[13px] file:mr-3 file:h-8 file:rounded-md file:border file:border-line-strong file:bg-surface file:px-3"
            />
          </Field>
        )}
        {source === "text" && (
          <Field label="Testo del calendario" hint="Copia il testo dal PDF o dal sito: una data per riga.">
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={6}
              className="w-full rounded-md border border-line-strong bg-surface px-2.5 py-2"
              placeholder={"vacanze di Natale: dal 24 dicembre 2027 al 7 gennaio 2028\nLunedì 8 dicembre 2027: Immacolata"}
            />
          </Field>
        )}
        <Button type="submit" loading={busy && !preview}>
          Leggi il calendario
        </Button>
      </form>
      <div className="mt-3">
        <ErrorNote>{error}</ErrorNote>
      </div>

      {preview && (
        <div className="mt-4 space-y-3 rounded-lg border border-line bg-surface p-3">
          <div className="flex flex-wrap items-end gap-2">
            <Field label="Anno" className="w-28">
              <Input value={year.name} onChange={(e) => setYear({ ...year, name: e.target.value })} required />
            </Field>
            <Field label="Inizio lezioni">
              <Input type="date" value={year.startDate} onChange={(e) => setYear({ ...year, startDate: e.target.value })} required />
            </Field>
            <Field label="Fine lezioni">
              <Input type="date" value={year.endDate} onChange={(e) => setYear({ ...year, endDate: e.target.value })} required />
            </Field>
          </div>
          <ul className="divide-y divide-line rounded-md border border-line">
            {preview.holidays.map((h, i) => (
              <li key={i}>
                <label className="flex items-center gap-3 px-3 py-1.5">
                  <input
                    type="checkbox"
                    className="size-4 accent-[var(--accent)]"
                    checked={!skip.has(i)}
                    onChange={() =>
                      setSkip((s) => {
                        const next = new Set(s);
                        if (next.has(i)) next.delete(i);
                        else next.add(i);
                        return next;
                      })
                    }
                  />
                  <span className="font-medium">{h.name}</span>
                  <span className="flex-1 text-muted">{range(h.startDate, h.endDate)}</span>
                  {exists(h) && <span className="text-xs text-muted">già presente</span>}
                </label>
              </li>
            ))}
          </ul>
          {preview.warnings.length > 0 && (
            <p className="rounded-md bg-warn-soft px-3 py-2 text-[13px] text-warn">
              Righe con date che non ho capito (aggiungile a mano se servono): {preview.warnings.join(" · ")}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button onClick={() => setPreview(null)}>Annulla</Button>
            <Button variant="primary" onClick={apply} loading={busy} disabled={!year.name || !year.startDate || !year.endDate}>
              Importa anno e {preview.holidays.length - skip.size} vacanze
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// --- Token API e link del calendario ---

const SCOPES: Record<ApiTokenDTO["scope"], string> = {
  read: "Solo lettura",
  write: "Lettura e scrittura",
  feed: "Link del calendario",
};

function TokenList({ tokens, onRevoke }: { tokens: ApiTokenDTO[]; onRevoke: (t: ApiTokenDTO) => void }) {
  if (tokens.length === 0) return null;
  return (
    <ul className="mb-3 divide-y divide-line rounded-lg border border-line">
      {tokens.map((t) => {
        const expired = t.expiresAt && new Date(t.expiresAt) < new Date();
        return (
          <li key={t.id} className="flex items-center gap-3 px-3 py-2">
            <KeyRound className="size-4 shrink-0 text-muted" aria-hidden />
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium">
                {t.name} <span className="font-mono text-xs font-normal text-muted">{t.prefix}…</span>
              </span>
              <span className="block text-[13px] text-muted">
                {SCOPES[t.scope]}
                {" · "}
                {t.lastUsedAt ? `usato il ${humanDate(t.lastUsedAt.slice(0, 10))}` : "mai usato"}
                {t.expiresAt && (expired ? " · scaduto" : ` · scade il ${humanDate(t.expiresAt.slice(0, 10))}`)}
              </span>
            </span>
            <IconButton label={`Revoca ${t.name}`} className="hover:bg-danger-soft hover:text-danger" onClick={() => onRevoke(t)}>
              <Trash2 className="size-4" />
            </IconButton>
          </li>
        );
      })}
    </ul>
  );
}

function useTokens() {
  const toast = useToast();
  const [tokens, setTokens] = useState<ApiTokenDTO[]>([]);
  const load = useCallback(() => api.get<ApiTokenDTO[]>("/api/settings/tokens").then(setTokens, (e) => toast(errorMessage(e), "error")), [toast]);
  useEffect(() => {
    load();
  }, [load]);
  const revoke = (t: ApiTokenDTO) =>
    confirm(`Revocare "${t.name}"? Chi lo usa non potrà più accedere.`) &&
    api.del(`/api/settings/tokens/${t.id}`).then(() => {
      toast("Revocato");
      load();
    }, (e) => toast(errorMessage(e), "error"));
  return { tokens, load, revoke };
}

export function ApiTokens() {
  const { tokens, load, revoke } = useTokens();
  const [draft, setDraft] = useState({ name: "", scope: "read" as "read" | "write", expiresInDays: "" });
  const [created, setCreated] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function create(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const t = await api.post<ApiTokenDTO & { token: string }>("/api/settings/tokens", {
        name: draft.name,
        scope: draft.scope,
        expiresInDays: draft.expiresInDays ? Number(draft.expiresInDays) : null,
      });
      setCreated(t.token);
      setDraft({ name: "", scope: "read", expiresInDays: "" });
      load();
    } catch (err) {
      setError(errorMessage(err));
    }
    setBusy(false);
  }

  return (
    <>
      <TokenList tokens={tokens.filter((t) => t.scope !== "feed")} onRevoke={revoke} />
      {created && (
        <div className="mb-3 space-y-2 rounded-lg border border-accent bg-accent-soft p-3">
          <p className="font-medium text-accent">Copia il token adesso: non verrà più mostrato.</p>
          <CopyField value={created} label="Token API" />
          <Button size="sm" variant="ghost" onClick={() => setCreated(null)}>
            Fatto
          </Button>
        </div>
      )}
      <form onSubmit={create} className="flex flex-wrap items-end gap-2">
        <Field label="Nome" className="min-w-40 flex-1">
          <Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="es. Script di backup" required />
        </Field>
        <Field label="Permessi" className="w-44">
          <select className={inputClass} value={draft.scope} onChange={(e) => setDraft({ ...draft, scope: e.target.value as "read" | "write" })}>
            <option value="read">{SCOPES.read}</option>
            <option value="write">{SCOPES.write}</option>
          </select>
        </Field>
        <Field label="Scadenza" className="w-36">
          <select className={inputClass} value={draft.expiresInDays} onChange={(e) => setDraft({ ...draft, expiresInDays: e.target.value })}>
            <option value="">Mai</option>
            <option value="30">30 giorni</option>
            <option value="90">90 giorni</option>
            <option value="365">1 anno</option>
          </select>
        </Field>
        <Button type="submit" loading={busy}>
          <Plus className="size-4" /> Genera token
        </Button>
      </form>
      <div className="mt-3 space-y-2">
        <ErrorNote>{error}</ErrorNote>
        <p className="text-[13px] text-muted">
          Usalo nell&apos;intestazione <code className="rounded bg-sunken px-1 font-mono text-xs">Authorization: Bearer ps_…</code>. L&apos;elenco
          delle API è su{" "}
          <a href="/api" target="_blank" className="font-medium text-accent hover:underline">
            /api
          </a>
          . I token non possono cambiare chiavi AI, calendari collegati né altri token.
        </p>
      </div>
    </>
  );
}

export function FeedLink() {
  const toast = useToast();
  const { tokens, load, revoke } = useTokens();
  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function create() {
    setBusy(true);
    try {
      const t = await api.post<ApiTokenDTO & { token: string }>("/api/settings/tokens", { name: "Calendario", scope: "feed" });
      setUrl(`${window.location.origin}/api/feed/${t.token}`);
      load();
    } catch (e) {
      toast(errorMessage(e), "error");
    }
    setBusy(false);
  }

  return (
    <>
      <TokenList tokens={tokens.filter((t) => t.scope === "feed")} onRevoke={revoke} />
      {url ? (
        <div className="space-y-2 rounded-lg border border-accent bg-accent-soft p-3">
          <p className="font-medium text-accent">Copia il link adesso: per sicurezza non verrà più mostrato.</p>
          <CopyField value={url} label="Link del calendario" />
          <p className="text-[13px] text-muted">
            Google Calendar: Altri calendari → + → Da URL. Apple Calendario: Archivio → Nuova sottoscrizione calendario.
          </p>
        </div>
      ) : (
        <Button onClick={create} loading={busy}>
          <Link2 className="size-4" /> Crea un link
        </Button>
      )}
    </>
  );
}

export function Backup() {
  return (
    <a href="/api/export" download>
      <Button>
        <Download className="size-4" /> Scarica i miei dati (JSON)
      </Button>
    </a>
  );
}
