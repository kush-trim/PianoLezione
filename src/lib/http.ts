import { AsyncLocalStorage } from "node:async_hooks";
import { connection } from "next/server";
import { ZodError } from "zod";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export const notFound = () => new ApiError(404, "Non trovato");

type Ctx<P> = { params: Promise<P> };

/** Il metodo della richiesta in corso: serve a requireUser per i permessi dei token. */
const requestMethod = new AsyncLocalStorage<string>();
export const currentMethod = () => requestMethod.getStore() ?? "GET";

/** Avvolge un route handler: converte gli errori in risposte JSON coerenti. */
export function route<P = Record<string, never>>(
  fn: (req: Request, params: P) => Promise<Response | unknown>,
) {
  return async (req: Request, ctx: Ctx<P>) => {
    // Le API dipendono sempre dalla richiesta (sessione): niente prerender in fase di build.
    // Fuori dal try: durante la build Next interrompe qui l'esecuzione.
    await connection();
    try {
      const params = await ctx.params;
      const out = await requestMethod.run(req.method, () => fn(req, params));
      if (out instanceof Response) return out;
      // null è una risposta vera ("niente"), undefined vuol dire solo "fatto".
      return Response.json(out === undefined ? { ok: true } : out);
    } catch (e) {
      if (e instanceof ApiError) {
        return Response.json({ error: e.message }, { status: e.status });
      }
      if (e instanceof ZodError) {
        const first = e.issues[0];
        const where = first?.path.length ? `${first.path.join(".")}: ` : "";
        return Response.json(
          { error: `Dati non validi (${where}${first?.message ?? "errore"})` },
          { status: 400 },
        );
      }
      console.error(e);
      return Response.json({ error: "Errore interno del server" }, { status: 500 });
    }
  };
}

export async function readJson(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    throw new ApiError(400, "Corpo della richiesta non valido");
  }
}
