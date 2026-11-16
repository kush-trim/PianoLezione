import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthForm } from "@/components/AuthForm";

export const metadata: Metadata = { title: "Accedi · PianoStudio" };

export default function LoginPage() {
  // useSearchParams (per il messaggio d'errore) va isolato in Suspense.
  return (
    <Suspense>
      <AuthForm />
    </Suspense>
  );
}
