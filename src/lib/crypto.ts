import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

// Cifratura dei dati riservati salvati nel database (chiavi AI, link dei calendari).
// AES-256-GCM con chiave derivata da APP_SECRET: un dump del database da solo non basta a leggerli.

function key(): Buffer {
  const secret = process.env.APP_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("APP_SECRET non impostata: serve per cifrare i dati riservati");
    }
    // Solo in sviluppo: chiave fissa, così l'app parte anche senza configurazione.
    return createHash("sha256").update("pianostudio-dev-secret").digest();
  }
  return createHash("sha256").update(secret).digest();
}

export function encrypt(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64"), cipher.getAuthTag().toString("base64"), data.toString("base64")].join(":");
}

/** Restituisce null se il testo è vuoto, manomesso o cifrato con un'altra chiave. */
export function decrypt(payload: string): string | null {
  if (!payload) return null;
  const [version, iv, tag, data] = payload.split(":");
  if (version !== "v1" || !iv || !tag || data === undefined) return null;
  try {
    const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64"));
    decipher.setAuthTag(Buffer.from(tag, "base64"));
    return Buffer.concat([decipher.update(Buffer.from(data, "base64")), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}

export function encryptJson(value: unknown): string {
  return encrypt(JSON.stringify(value));
}

export function decryptJson<T>(payload: string, fallback: T): T {
  const plain = decrypt(payload);
  if (plain === null) return fallback;
  try {
    return JSON.parse(plain) as T;
  } catch {
    return fallback;
  }
}
