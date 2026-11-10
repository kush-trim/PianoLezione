"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { api, errorMessage } from "@/lib/api";
import { Button, ErrorNote, Field, Input } from "./ui";

export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const isRegister = mode === "register";
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await api.post(
        isRegister ? "/api/auth/register" : "/api/auth/login",
        isRegister ? { name, email, password } : { email, password },
      );
      // Navigazione completa: il cookie di sessione è appena stato impostato.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.assign("/settimana");
    } catch (err) {
      setError(errorMessage(err));
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <p className="font-display text-3xl font-semibold tracking-tight">
          Piano<span className="text-accent">Studio</span>
        </p>
        <p className="mt-1 mb-6 text-muted">
          {isRegister
            ? "Crea il tuo account per preparare i piani lezione."
            : "Accedi per continuare con i tuoi piani lezione."}
        </p>

        <form onSubmit={submit} className="space-y-4 rounded-xl border border-line bg-surface p-5">
          {isRegister && (
            <Field label="Nome">
              <Input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required autoFocus />
            </Field>
          )}
          <Field label="Email">
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
              autoFocus={!isRegister}
            />
          </Field>
          <Field label="Password" hint={isRegister ? "Almeno 8 caratteri." : undefined}>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={isRegister ? "new-password" : "current-password"}
              minLength={isRegister ? 8 : undefined}
              required
            />
          </Field>
          <ErrorNote>{error}</ErrorNote>
          <Button type="submit" variant="primary" loading={loading} className="w-full">
            {isRegister ? "Crea account" : "Accedi"}
          </Button>
        </form>

        <p className="mt-4 text-center text-muted">
          {isRegister ? "Hai già un account? " : "Non hai un account? "}
          <Link href={isRegister ? "/login" : "/registrati"} className="font-medium text-accent hover:underline">
            {isRegister ? "Accedi" : "Registrati"}
          </Link>
        </p>
      </div>
    </main>
  );
}
