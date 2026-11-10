"use client";

import { RotateCcw } from "lucide-react";
import { useEffect, useState } from "react";
import { api, errorMessage } from "@/lib/api";
import type { PlanDTO, VersionDTO } from "@/lib/types";
import { Button, Dialog, ErrorNote, Loading } from "./ui";

const when = (iso: string) =>
  new Date(iso).toLocaleString("it-CH", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });

export function VersionsDialog({
  planId,
  onClose,
  onRestored,
}: {
  planId: string | null;
  onClose: () => void;
  onRestored: (plan: PlanDTO) => void;
}) {
  const [versions, setVersions] = useState<VersionDTO[] | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    if (!planId) return;
    let stale = false;
    api.get<VersionDTO[]>(`/api/plans/${planId}/versions`).then(
      (v) => !stale && setVersions(v),
      (e) => !stale && setError(errorMessage(e)),
    );
    return () => {
      stale = true;
      setVersions(null);
      setError("");
    };
  }, [planId]);

  async function restore(v: VersionDTO) {
    if (!planId) return;
    setBusy(v.id);
    setError("");
    try {
      onRestored(await api.post<PlanDTO>(`/api/plans/${planId}/versions/${v.id}/restore`));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <Dialog open={!!planId} onClose={onClose} title="Versioni precedenti">
      <p className="mb-3 text-[13px] text-muted">
        Mentre lavori il piano viene salvato da solo, e ogni tanto ne viene conservata una copia. Ripristinando
        una versione, quella attuale viene salvata qui: puoi sempre tornare indietro.
      </p>
      <ErrorNote>{error}</ErrorNote>
      {!versions && !error && <Loading />}
      {versions?.length === 0 && <p className="py-6 text-center text-muted">Ancora nessuna versione salvata.</p>}
      {versions && versions.length > 0 && (
        <ul className="divide-y divide-line">
          {versions.map((v) => (
            <li key={v.id} className="flex items-center justify-between gap-3 py-2.5">
              <div className="min-w-0">
                <p className="font-medium">{when(v.createdAt)}</p>
                <p className="truncate text-[13px] text-muted">
                  {v.title || "Senza titolo"} · {v.phaseCount} {v.phaseCount === 1 ? "fase" : "fasi"} · {v.totalMin}’
                </p>
              </div>
              <Button size="sm" loading={busy === v.id} disabled={!!busy} onClick={() => restore(v)}>
                <RotateCcw className="size-3.5" /> Ripristina
              </Button>
            </li>
          ))}
        </ul>
      )}
    </Dialog>
  );
}
