"use client";

import { FileText, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Button, EmptyState, IconButton, Input, Loading, PageHeader, useToast } from "@/components/ui";
import { api, errorMessage } from "@/lib/api";
import type { PhaseTemplateDTO, PlanDTO, PlanSummary } from "@/lib/types";

const EMPTY = { name: "", modality: "", durationMin: 10 };

export default function ModelliPage() {
  const router = useRouter();
  const toast = useToast();
  const [plans, setPlans] = useState<PlanSummary[] | null>(null);
  const [phases, setPhases] = useState<PhaseTemplateDTO[] | null>(null);
  const [draft, setDraft] = useState(EMPTY);

  const fail = useCallback((e: unknown) => toast(errorMessage(e), "error"), [toast]);
  const load = useCallback(
    () =>
      Promise.all([
        api.get<PlanSummary[]>("/api/plans?templates=1"),
        api.get<PhaseTemplateDTO[]>("/api/phase-templates"),
      ]).then(([p, t]) => {
        setPlans(p);
        setPhases(t);
      }, fail),
    [fail],
  );
  useEffect(() => {
    load();
  }, [load]);

  if (!plans || !phases) return <Loading />;

  async function createFromTemplate(id: string) {
    try {
      const plan = await api.post<PlanDTO>("/api/plans", { fromTemplateId: id });
      router.push(`/piani/${plan.id}`);
    } catch (e) {
      fail(e);
    }
  }

  async function deletePlan(p: PlanSummary) {
    if (!confirm(`Eliminare il modello "${p.title || "Senza titolo"}"? I piani già creati da questo modello restano.`)) return;
    await api.del(`/api/plans/${p.id}`).then(load, fail);
  }

  async function addPhase(e: FormEvent) {
    e.preventDefault();
    try {
      await api.post("/api/phase-templates", draft);
      setDraft(EMPTY);
      await load();
    } catch (err) {
      fail(err);
    }
  }

  // Modifica in linea: aggiorna subito l'elenco e salva quando si esce dal campo.
  const patchLocal = (id: string, p: Partial<PhaseTemplateDTO>) =>
    setPhases((list) => list && list.map((x) => (x.id === id ? { ...x, ...p } : x)));

  async function savePhase(t: PhaseTemplateDTO) {
    if (!t.name.trim() || t.durationMin < 1) return load();
    await api.put(`/api/phase-templates/${t.id}`, { name: t.name, modality: t.modality, durationMin: t.durationMin }).catch(fail);
  }

  return (
    <>
      <PageHeader title="Modelli" subtitle="Piani e fasi da riutilizzare, per non ripartire ogni volta da zero." />

      <div className="grid gap-8 xl:grid-cols-2">
        <section>
          <h2 className="mb-1 font-display text-xl font-semibold">Modelli di piano</h2>
          <p className="mb-3 text-muted">
            Apri un piano e scegli «Salva come modello» per ritrovarlo qui.
          </p>
          {plans.length === 0 ? (
            <EmptyState title="Nessun modello di piano">
              Utile per le strutture che ripeti spesso: laboratorio, verifica, lezione doppia…
            </EmptyState>
          ) : (
            <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
              {plans.map((p) => (
                <li key={p.id} className="flex items-center gap-3 px-3 py-2.5">
                  <FileText className="size-4 shrink-0 text-muted" aria-hidden />
                  <Link href={`/piani/${p.id}`} className="min-w-0 flex-1 hover:underline">
                    <span className="block truncate font-medium">{p.title || "Senza titolo"}</span>
                    <span className="block text-[13px] text-muted">
                      {p.phaseCount} {p.phaseCount === 1 ? "fase" : "fasi"} · {p.totalMin}’
                    </span>
                  </Link>
                  <Button size="sm" variant="primary" onClick={() => createFromTemplate(p.id)}>
                    <Plus className="size-3.5" /> Usa
                  </Button>
                  <IconButton label={`Elimina il modello "${p.title || "Senza titolo"}"`} className="hover:bg-danger-soft hover:text-danger" onClick={() => deletePlan(p)}>
                    <Trash2 className="size-4" />
                  </IconButton>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <h2 className="mb-1 font-display text-xl font-semibold">Fasi predefinite</h2>
          <p className="mb-3 text-muted">Compaiono sotto la tabella di ogni piano: un clic e la fase è aggiunta.</p>

          <div className="rounded-xl border border-line bg-surface">
            <div className="grid grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_76px_32px] gap-2 border-b border-line px-3 py-2 text-[13px] font-semibold">
              <span>Fase</span>
              <span>Modalità</span>
              <span>Minuti</span>
              <span />
            </div>
            <ul className="divide-y divide-line">
              {phases.map((t) => (
                <li key={t.id} className="grid grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_76px_32px] items-center gap-2 px-3 py-1.5">
                  <input
                    className="cell-input"
                    value={t.name}
                    aria-label="Nome della fase"
                    onChange={(e) => patchLocal(t.id, { name: e.target.value })}
                    onBlur={() => savePhase(t)}
                  />
                  <input
                    className="cell-input text-muted"
                    value={t.modality}
                    aria-label={`Modalità di ${t.name}`}
                    placeholder="—"
                    onChange={(e) => patchLocal(t.id, { modality: e.target.value })}
                    onBlur={() => savePhase(t)}
                  />
                  <input
                    type="number"
                    min={1}
                    max={600}
                    className="cell-input tabular"
                    value={t.durationMin}
                    aria-label={`Durata di ${t.name} in minuti`}
                    onChange={(e) => patchLocal(t.id, { durationMin: Math.round(Number(e.target.value)) || 0 })}
                    onBlur={() => savePhase(t)}
                  />
                  <IconButton
                    label={`Elimina la fase ${t.name}`}
                    className="hover:bg-danger-soft hover:text-danger"
                    onClick={() => api.del(`/api/phase-templates/${t.id}`).then(load, fail)}
                  >
                    <Trash2 className="size-4" />
                  </IconButton>
                </li>
              ))}
            </ul>
            <form onSubmit={addPhase} className="grid grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_76px_auto] items-center gap-2 border-t border-line bg-sunken/50 px-3 py-2">
              <Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="Nuova fase" aria-label="Nome della nuova fase" required />
              <Input value={draft.modality} onChange={(e) => setDraft({ ...draft, modality: e.target.value })} placeholder="modalità" aria-label="Modalità della nuova fase" />
              <Input
                type="number"
                min={1}
                max={600}
                value={draft.durationMin}
                onChange={(e) => setDraft({ ...draft, durationMin: Math.round(Number(e.target.value)) || 0 })}
                aria-label="Durata della nuova fase in minuti"
                required
              />
              <Button type="submit" variant="primary">
                <Plus className="size-4" /> Aggiungi
              </Button>
            </form>
          </div>
        </section>
      </div>
    </>
  );
}
