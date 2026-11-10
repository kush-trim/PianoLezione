// La proposta di modifiche che l'assistente può fare a un piano lezione.
// Lo schema serve sia come definizione dello strumento per il modello sia per validare ciò che torna.

import { z } from "zod";
import type { PlanDTO } from "./types";

const obiettivo = z.object({
  verbo: z.string().describe("Un verbo dell'elenco consentito, scritto esattamente come nell'elenco"),
  testo: z.string().describe("Il resto della frase, senza soggetto e senza verbo"),
});

export const proposalSchema = z.object({
  sintesi: z.string().describe("Una frase che dice all'insegnante che cosa cambia"),
  titolo: z.string().optional(),
  prerequisiti: z.string().optional().describe("Un prerequisito per riga, ogni riga inizia con '- '"),
  traguardo: z.string().optional(),
  verifica: z.string().optional(),
  obiettiviInsegnamento: z.array(obiettivo).optional().describe("Sostituisce tutti gli obiettivi d'insegnamento"),
  obiettiviApprendimento: z.array(obiettivo).optional().describe("Sostituisce tutti gli obiettivi d'apprendimento"),
  fasi: z
    .array(
      z.object({
        nome: z.string(),
        modalita: z.string().describe("es. frontale, a coppie, dialogata; vuoto se non serve"),
        durataMin: z.number().describe("Durata in minuti, multiplo di 5"),
        obiettiviSpecifici: z.string(),
        descrizione: z.string(),
        prodottoAtteso: z.string(),
        materiale: z.string(),
      }),
    )
    .optional()
    .describe("Sostituisce tutta l'articolazione operativa"),
});

export type AiProposal = z.infer<typeof proposalSchema>;

/** Tiene solo i verbi dell'elenco: gli altri restano da scegliere a mano. */
export function sanitizeProposal(p: AiProposal, verbs: { insegnamento: string[]; apprendimento: string[] }): AiProposal {
  const fix = (items: AiProposal["obiettiviInsegnamento"], allowed: string[]) =>
    items?.map((o) => {
      const match = allowed.find((v) => v.toLowerCase() === o.verbo.trim().toLowerCase());
      return { verbo: match ?? "", testo: match ? o.testo.trim() : `${o.verbo} ${o.testo}`.trim() };
    });
  return {
    ...p,
    obiettiviInsegnamento: fix(p.obiettiviInsegnamento, verbs.insegnamento),
    obiettiviApprendimento: fix(p.obiettiviApprendimento, verbs.apprendimento),
    fasi: p.fasi?.map((f) => ({ ...f, durataMin: Math.max(0, Math.min(600, Math.round(f.durataMin) || 0)) })),
  };
}

const newId = () => crypto.randomUUID();

/** Trasforma la proposta nelle modifiche da applicare al piano. */
export function proposalToPatch(p: AiProposal): Partial<PlanDTO> {
  const patch: Partial<PlanDTO> = {};
  if (p.titolo !== undefined) patch.title = p.titolo;
  if (p.prerequisiti !== undefined) patch.prerequisiti = p.prerequisiti;
  if (p.traguardo !== undefined) patch.traguardo = p.traguardo;
  if (p.verifica !== undefined) patch.verifica = p.verifica;
  if (p.obiettiviInsegnamento) {
    patch.obiettiviInsegnamento = p.obiettiviInsegnamento.map((o) => ({ id: newId(), ...o }));
  }
  if (p.obiettiviApprendimento) {
    patch.obiettiviApprendimento = p.obiettiviApprendimento.map((o) => ({ id: newId(), ...o }));
  }
  if (p.fasi) {
    patch.phases = p.fasi.map((f) => ({
      id: newId(),
      name: f.nome,
      modality: f.modalita,
      durationMin: f.durataMin,
      obiettiviSpecifici: f.obiettiviSpecifici,
      descrizione: f.descrizione,
      prodottoAtteso: f.prodottoAtteso,
      materiale: f.materiale,
    }));
  }
  return patch;
}

/** Elenco leggibile di ciò che la proposta cambia. */
export function proposalChanges(p: AiProposal): string[] {
  const out: string[] = [];
  if (p.titolo !== undefined) out.push(`Titolo: «${p.titolo}»`);
  if (p.prerequisiti !== undefined) out.push("Prerequisiti");
  if (p.traguardo !== undefined) out.push("Traguardo di apprendimento");
  if (p.obiettiviInsegnamento) out.push(`Obiettivi d’insegnamento (${p.obiettiviInsegnamento.length})`);
  if (p.obiettiviApprendimento) out.push(`Obiettivi d’apprendimento (${p.obiettiviApprendimento.length})`);
  if (p.fasi) out.push(`Articolazione operativa: ${p.fasi.length} fasi, ${p.fasi.reduce((s, f) => s + f.durataMin, 0)}’`);
  if (p.verifica !== undefined) out.push("Verifica dell’obiettivo");
  return out;
}
