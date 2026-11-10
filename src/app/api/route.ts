import { apiDocs } from "@/lib/api-docs";

// GET /api → la descrizione di tutte le API: che cosa chiedono e che cosa restituiscono.
// È un documento fisso, pubblico (non contiene dati degli utenti).
export function GET() {
  return new Response(JSON.stringify(apiDocs, null, 2), {
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}
