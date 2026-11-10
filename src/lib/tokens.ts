// Token API: forma pubblica (mai il valore né l'hash).

import type { ApiTokenDTO } from "./types";

export const tokenSelect = { id: true, name: true, prefix: true, scope: true, lastUsedAt: true, expiresAt: true, createdAt: true };

export function toTokenDTO(t: {
  id: string;
  name: string;
  prefix: string;
  scope: string;
  lastUsedAt: Date | null;
  expiresAt: Date | null;
  createdAt: Date;
}): ApiTokenDTO {
  return {
    id: t.id,
    name: t.name,
    prefix: t.prefix,
    scope: t.scope as ApiTokenDTO["scope"],
    lastUsedAt: t.lastUsedAt?.toISOString() ?? null,
    expiresAt: t.expiresAt?.toISOString() ?? null,
    createdAt: t.createdAt.toISOString(),
  };
}
