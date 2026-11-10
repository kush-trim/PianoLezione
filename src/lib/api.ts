// Client HTTP del frontend verso le API dell'app.

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method,
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new HttpError(0, "Server non raggiungibile. Controlla la connessione.");
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    // Sessione scaduta: si torna al login (tranne che dalle pagine di accesso).
    if (res.status === 401 && !path.startsWith("/api/auth/")) {
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.assign("/login");
    }
    throw new HttpError(res.status, data?.error ?? "Qualcosa non ha funzionato.");
  }
  return data as T;
}

export const api = {
  get: <T>(path: string) => request<T>("GET", path),
  post: <T>(path: string, body: unknown = {}) => request<T>("POST", path, body),
  put: <T>(path: string, body: unknown) => request<T>("PUT", path, body),
  patch: <T>(path: string, body: unknown) => request<T>("PATCH", path, body),
  del: <T>(path: string) => request<T>("DELETE", path),
};

export const errorMessage = (e: unknown) =>
  e instanceof Error ? e.message : "Qualcosa non ha funzionato.";
