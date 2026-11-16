"use client";

import { Bell, Check, FolderInput, X } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { NOTIFICATIONS_CHANGED } from "@/components/AppShell";
import { Button, cx, EmptyState, Loading, PageHeader, useToast } from "@/components/ui";
import { api, errorMessage } from "@/lib/api";
import type { NotificationsDTO } from "@/lib/types";

const when = (iso: string) =>
  new Date(iso).toLocaleString("it-CH", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });

export default function NotifichePage() {
  const toast = useToast();
  const [data, setData] = useState<NotificationsDTO | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(
    () => api.get<NotificationsDTO>("/api/notifications").then(setData, (e) => toast(errorMessage(e), "error")),
    [toast],
  );
  useEffect(() => {
    load();
  }, [load]);

  // Aprendo la pagina gli avvisi diventano letti (gli inviti restano finché non si risponde).
  const hasUnreadItems = !!data?.items.some((n) => !n.read);
  useEffect(() => {
    if (!hasUnreadItems) return;
    const t = setTimeout(() => {
      api.post("/api/notifications/read").then(() => window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED)), () => {});
    }, 1500);
    return () => clearTimeout(t);
  }, [hasUnreadItems]);

  async function respond(id: string, accept: boolean) {
    setBusy(id);
    try {
      await api.post(`/api/invites/${id}/${accept ? "accept" : "decline"}`);
      toast(accept ? "Invito accettato: la cartella è tra i tuoi file" : "Invito rifiutato");
      await load();
      window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED));
    } catch (e) {
      toast(errorMessage(e), "error");
    }
    setBusy(null);
  }

  if (!data) return <Loading />;

  return (
    <div className="max-w-2xl">
      <PageHeader title="Notifiche" subtitle="Inviti alle cartelle condivise e avvisi." />

      {data.invites.length > 0 && (
        <section className="mb-6">
          <h2 className="mb-2 text-[13px] font-semibold tracking-wide text-muted uppercase">Inviti</h2>
          <ul className="space-y-2">
            {data.invites.map((i) => (
              <li key={i.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-accent/40 bg-accent-soft/40 px-4 py-3">
                <FolderInput className="size-5 shrink-0 text-accent" aria-hidden />
                <div className="min-w-0 flex-1">
                  <p>
                    <strong>{i.from.name}</strong> ti invita nella cartella <strong>«{i.folderName}»</strong>
                  </p>
                  <p className="text-[13px] text-muted">
                    {i.from.email} · {when(i.createdAt)}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button variant="primary" onClick={() => respond(i.id, true)} loading={busy === i.id} disabled={!!busy}>
                    <Check className="size-4" /> Accetta
                  </Button>
                  <Button onClick={() => respond(i.id, false)} disabled={!!busy}>
                    <X className="size-4" /> Rifiuta
                  </Button>
                </div>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[13px] text-muted">
            Accettando, la cartella compare tra i tuoi <Link href="/file" className="text-accent hover:underline">File</Link> e
            su Google Drive in «Condivisi con me». Puoi caricarci file e collegarli ai tuoi piani.
          </p>
        </section>
      )}

      {data.items.length === 0 && data.invites.length === 0 ? (
        <EmptyState title="Nessuna notifica">Qui arrivano gli inviti dei colleghi e gli avvisi sulle cartelle condivise.</EmptyState>
      ) : (
        data.items.length > 0 && (
          <section>
            <h2 className="mb-2 text-[13px] font-semibold tracking-wide text-muted uppercase">Avvisi</h2>
            <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
              {data.items.map((n) => (
                <li key={n.id} className="flex items-start gap-3 px-4 py-3">
                  <Bell className={cx("mt-0.5 size-4 shrink-0", n.read ? "text-muted" : "text-accent")} aria-hidden />
                  <div className="min-w-0 flex-1">
                    <p className={cx(!n.read && "font-medium")}>{n.text}</p>
                    <p className="text-[13px] text-muted">{when(n.createdAt)}</p>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )
      )}
    </div>
  );
}
