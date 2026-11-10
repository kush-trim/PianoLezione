"use client";

import { Check, Send, Sparkles, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { proposalChanges, proposalToPatch, type AiProposal } from "@/lib/ai-proposal";
import type { PlanDTO, SettingsDTO, VerbDTO } from "@/lib/types";
import { AutoTextarea, Button, cx, IconButton } from "./ui";

type Message = {
  role: "user" | "assistant";
  content: string;
  proposal?: AiProposal;
  proposalState?: "applied" | "discarded";
  error?: string;
};

const SUGGESTIONS = [
  "Proponi le fasi per questa lezione",
  "Scrivi gli obiettivi con i verbi dell’elenco",
  "Controlla se i tempi sono realistici",
  "Suggerisci come verificare l’obiettivo",
];

/** Pannello laterale dell'assistente: conversa sul piano e propone modifiche da applicare. */
export function AssistantPanel({
  open,
  onClose,
  plan,
  settings,
  verbs,
  beforeSend,
  onApply,
}: {
  open: boolean;
  onClose: () => void;
  plan: PlanDTO;
  settings: SettingsDTO | null;
  verbs: VerbDTO[];
  /** Salva le modifiche in sospeso: l'assistente legge il piano dal server. */
  beforeSend: () => Promise<boolean>;
  onApply: (patch: Partial<PlanDTO>) => void;
}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages]);
  // Chiudendo la pagina la richiesta in corso si interrompe.
  useEffect(() => () => abortRef.current?.abort(), []);

  if (!open) return null;

  const configured = !!settings?.aiProvider && settings.aiKeys[settings.aiProvider];
  const missingVerbs = verbs.length === 0;

  async function send(text: string) {
    const question = text.trim();
    if (!question || busy) return;
    setInput("");
    setBusy(true);
    const history = [...messages, { role: "user" as const, content: question }];
    setMessages([...history, { role: "assistant", content: "" }]);
    const patchLast = (p: Partial<Message>) =>
      setMessages((list) => list.map((m, i) => (i === list.length - 1 ? { ...m, ...p } : m)));

    try {
      if (!(await beforeSend())) throw new Error("Non riesco a salvare le ultime modifiche. Riprova tra poco.");
      abortRef.current = new AbortController();
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: abortRef.current.signal,
        body: JSON.stringify({
          planId: plan.id,
          // Al modello vanno solo i testi: le proposte già fatte sono riassunte.
          messages: history
            .filter((m) => m.content || m.proposal)
            .map((m) => ({
              role: m.role,
              content:
                m.content +
                (m.proposal
                  ? `\n[Proposta ${m.proposalState === "applied" ? "applicata" : m.proposalState === "discarded" ? "scartata" : "in attesa"}: ${m.proposal.sintesi}]`
                  : ""),
            })),
        }),
      });
      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error ?? "L'assistente non ha risposto.");
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let content = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const raw of lines) {
          if (!raw.trim()) continue;
          const event = JSON.parse(raw) as { t: "text" | "proposal" | "error"; v: unknown };
          if (event.t === "text") {
            content += event.v as string;
            patchLast({ content });
          } else if (event.t === "proposal") patchLast({ proposal: event.v as AiProposal });
          else if (event.t === "error") patchLast({ error: event.v as string });
        }
      }
    } catch (e) {
      if (!(e instanceof DOMException && e.name === "AbortError")) {
        patchLast({ error: e instanceof Error ? e.message : "L'assistente non ha risposto." });
      }
    } finally {
      setBusy(false);
    }
  }

  const setProposalState = (index: number, state: Message["proposalState"]) =>
    setMessages((list) => list.map((m, i) => (i === index ? { ...m, proposalState: state } : m)));

  return (
    <aside
      aria-label="Assistente"
      className="fixed inset-y-0 right-0 z-30 flex w-full max-w-md flex-col border-l border-line bg-surface shadow-2xl print:hidden"
    >
      <header className="flex items-center justify-between border-b border-line px-4 py-3">
        <h2 className="flex items-center gap-2 font-display text-lg font-semibold">
          <Sparkles className="size-4 text-accent" aria-hidden /> Assistente
        </h2>
        <IconButton label="Chiudi l’assistente" onClick={onClose}>
          <X className="size-4" />
        </IconButton>
      </header>

      {!configured ? (
        <div className="p-5">
          <p className="font-medium">L’assistente non è ancora configurato.</p>
          <p className="mt-1 text-muted">
            Funziona con la tua chiave personale di Claude, Gemini o OpenAI: i costi sono quelli del tuo account
            presso il fornitore.
          </p>
          <Link href="/impostazioni#assistente" className="mt-4 inline-block">
            <Button variant="primary">Vai alle Impostazioni</Button>
          </Link>
        </div>
      ) : (
        <>
          <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4" aria-live="polite">
            {messages.length === 0 && (
              <div>
                <p className="text-muted">
                  Chiedi aiuto su questo piano. Le modifiche che propongo le vedi prima: decidi tu se applicarle.
                </p>
                {missingVerbs && <p className="mt-2 text-[13px] text-warn">L’elenco dei verbi è vuoto: gli obiettivi proposti saranno senza verbo.</p>}
                <ul className="mt-4 space-y-1.5">
                  {SUGGESTIONS.map((s) => (
                    <li key={s}>
                      <button
                        type="button"
                        onClick={() => send(s)}
                        className="w-full rounded-lg border border-line-strong px-3 py-2 text-left hover:border-accent hover:text-accent"
                      >
                        {s}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {messages.map((m, i) => (
              <div key={i} className={cx("flex flex-col gap-2", m.role === "user" ? "items-end" : "items-start")}>
                {(m.content || (busy && i === messages.length - 1 && !m.proposal && !m.error)) && (
                  <p
                    className={cx(
                      "max-w-[92%] rounded-xl px-3 py-2 leading-relaxed whitespace-pre-wrap",
                      m.role === "user" ? "bg-accent text-white" : "bg-sunken",
                    )}
                  >
                    {m.content || "…"}
                  </p>
                )}
                {m.proposal && (
                  <div className="w-full rounded-xl border border-accent/40 bg-accent-soft/50 p-3">
                    <p className="font-medium">{m.proposal.sintesi}</p>
                    <ul className="mt-1.5 list-disc space-y-0.5 pl-5 text-[13px]">
                      {proposalChanges(m.proposal).map((c) => (
                        <li key={c}>{c}</li>
                      ))}
                    </ul>
                    {m.proposal.fasi && (
                      <ol className="tabular mt-2 space-y-0.5 border-t border-accent/20 pt-2 text-[13px] text-muted">
                        {m.proposal.fasi.map((f, n) => (
                          <li key={n} className="flex justify-between gap-3">
                            <span className="truncate">
                              {f.nome}
                              {f.modalita && ` (${f.modalita})`}
                            </span>
                            <span className="shrink-0">{f.durataMin}’</span>
                          </li>
                        ))}
                      </ol>
                    )}
                    {[...(m.proposal.obiettiviInsegnamento ?? []), ...(m.proposal.obiettiviApprendimento ?? [])].some((o) => !o.verbo) && (
                      <p className="mt-2 text-[13px] text-warn">Alcuni obiettivi usano un verbo fuori elenco: dopo averla applicata, scegli tu il verbo.</p>
                    )}
                    <div className="mt-3 flex items-center gap-2">
                      {m.proposalState ? (
                        <span className="flex items-center gap-1.5 text-[13px] font-medium text-muted">
                          {m.proposalState === "applied" ? (
                            <>
                              <Check className="size-4 text-ok" /> Applicata al piano
                            </>
                          ) : (
                            "Scartata"
                          )}
                        </span>
                      ) : (
                        <>
                          <Button
                            size="sm"
                            variant="primary"
                            onClick={() => {
                              onApply(proposalToPatch(m.proposal!));
                              setProposalState(i, "applied");
                            }}
                          >
                            <Check className="size-3.5" /> Applica al piano
                          </Button>
                          <Button size="sm" onClick={() => setProposalState(i, "discarded")}>
                            Scarta
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                )}
                {m.error && (
                  <p role="alert" className="w-full rounded-lg bg-danger-soft px-3 py-2 text-[13px] text-danger">
                    {m.error}
                  </p>
                )}
              </div>
            ))}
            <div ref={endRef} />
          </div>

          <form
            onSubmit={(e: FormEvent) => {
              e.preventDefault();
              send(input);
            }}
            className="flex items-end gap-2 border-t border-line p-3"
          >
            <AutoTextarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send(input);
                }
              }}
              placeholder="Scrivi all’assistente…"
              aria-label="Messaggio per l’assistente"
              minRows={1}
              className="max-h-40 min-w-0 flex-1 resize-none rounded-md border border-line-strong bg-surface px-3 py-2 leading-snug"
            />
            <Button type="submit" variant="primary" loading={busy} disabled={!input.trim()} aria-label="Invia">
              {!busy && <Send className="size-4" />}
            </Button>
          </form>
          <p className="px-3 pb-2 text-center text-xs text-muted">
            Le risposte possono contenere errori: controlla sempre le proposte prima di applicarle.
          </p>
        </>
      )}
    </aside>
  );
}
