"use client";

import { Crown, LogOut, Mail, UserMinus, X } from "lucide-react";
import { useState, type FormEvent } from "react";
import { api, errorMessage } from "@/lib/api";
import type { MaterialFolderDTO } from "@/lib/types";
import { Button, Dialog, ErrorNote, IconButton, Input, useToast } from "./ui";

/**
 * Chi ha accesso a una cartella di esercizi. Il proprietario invita per email Google,
 * ritira gli inviti e toglie i membri; un membro vede chi c'è e può uscire.
 */
export function ShareDialog({
  folder,
  meId,
  onClose,
  onChanged,
  onLeft,
}: {
  folder: MaterialFolderDTO | null;
  meId: string;
  onClose: () => void;
  onChanged: () => void;
  onLeft: () => void;
}) {
  const toast = useToast();
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  if (!folder) return null;
  const owner = folder.role === "owner";

  async function invite(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api.post(`/api/material-folders/${folder!.id}/invites`, { email });
      toast(`Invito mandato a ${email.trim()}`);
      setEmail("");
      onChanged();
    } catch (err) {
      setError(errorMessage(err));
    }
    setBusy(false);
  }

  async function act(fn: () => Promise<unknown>, done: string) {
    try {
      await fn();
      toast(done);
      onChanged();
    } catch (e) {
      toast(errorMessage(e), "error");
    }
  }

  return (
    <Dialog open onClose={onClose} title={`Condividi «${folder.name}»`}>
      <div className="space-y-5">
        <ul className="divide-y divide-line rounded-lg border border-line">
          <li className="flex items-center gap-3 px-3 py-2">
            <Crown className="size-4 shrink-0 text-warn" aria-hidden />
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium">
                {folder.owner.name}
                {folder.owner.id === meId && " (tu)"}
              </span>
              <span className="block truncate text-[13px] text-muted">{folder.owner.email} · proprietario</span>
            </span>
          </li>
          {folder.members.map((m) => (
            <li key={m.id} className="flex items-center gap-3 px-3 py-2">
              <span className="flex size-4 shrink-0 items-center justify-center rounded-full bg-accent-soft text-[10px] font-semibold text-accent" aria-hidden>
                {m.name.charAt(0).toUpperCase()}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">
                  {m.name}
                  {m.id === meId && " (tu)"}
                </span>
                <span className="block truncate text-[13px] text-muted">{m.email} · può caricare e collegare file</span>
              </span>
              {owner && (
                <IconButton
                  label={`Togli ${m.name} dalla cartella`}
                  className="hover:bg-danger-soft hover:text-danger"
                  onClick={() =>
                    confirm(`Togliere ${m.name} dalla cartella? Non vedrà più i file, né su Drive né nei suoi piani.`) &&
                    act(() => api.del(`/api/material-folders/${folder.id}/members/${m.id}`), `${m.name} non ha più accesso`)
                  }
                >
                  <UserMinus className="size-4" />
                </IconButton>
              )}
            </li>
          ))}
          {owner &&
            folder.invites.map((i) => (
              <li key={i.id} className="flex items-center gap-3 px-3 py-2">
                <Mail className="size-4 shrink-0 text-muted" aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{i.email}</span>
                  <span className="block text-[13px] text-muted">invito in attesa di risposta</span>
                </span>
                <IconButton
                  label={`Ritira l'invito a ${i.email}`}
                  onClick={() => act(() => api.del(`/api/material-folders/${folder.id}/invites/${i.id}`), "Invito ritirato")}
                >
                  <X className="size-4" />
                </IconButton>
              </li>
            ))}
        </ul>

        {owner ? (
          <form onSubmit={invite} className="space-y-2">
            <label className="block text-[13px] font-medium" htmlFor="invite-email">
              Invita un collega
            </label>
            <div className="flex gap-2">
              <Input
                id="invite-email"
                type="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setError("");
                }}
                placeholder="email Google del collega"
                required
                autoComplete="off"
                autoFocus
              />
              <Button type="submit" variant="primary" loading={busy}>
                Invita
              </Button>
            </div>
            <ErrorNote>{error}</ErrorNote>
            <p className="text-[13px] text-muted">
              Il collega trova l’invito nelle sue Notifiche (se non è ancora iscritto, al primo accesso con Google). Accettando, la
              cartella viene condivisa con lui anche su Google Drive. I file restano sul tuo Drive.
            </p>
          </form>
        ) : (
          <div className="flex items-center justify-between gap-3">
            <p className="text-[13px] text-muted">I file di questa cartella sono sul Drive di {folder.owner.name}.</p>
            <Button
              variant="danger"
              onClick={() =>
                confirm(`Uscire dalla cartella «${folder.name}»? I suoi file spariranno dai tuoi piani.`) &&
                api.del(`/api/material-folders/${folder.id}/members/${meId}`).then(
                  () => {
                    toast(`Sei uscito da «${folder.name}»`);
                    onLeft();
                  },
                  (e) => toast(errorMessage(e), "error"),
                )
              }
            >
              <LogOut className="size-4" /> Esci dalla cartella
            </Button>
          </div>
        )}
      </div>
    </Dialog>
  );
}
