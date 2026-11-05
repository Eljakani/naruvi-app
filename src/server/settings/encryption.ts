import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto"
import { SettingsError } from "./errors"

export function encryptionReady(key: string): boolean {
  return /^[a-f0-9]{64}$/i.test(key)
}

function keyBytes(key: string) {
  if (!encryptionReady(key)) throw new SettingsError("Set SETTINGS_ENCRYPTION_KEY to a 64-character random hex key before saving an API key.")
  return Buffer.from(key, "hex")
}

/** A new 96-bit nonce per write; AAD binds the ciphertext to its setting and endpoint. */
export function encryptSecret(secret: string, key: string, context: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv("aes-256-gcm", keyBytes(key), iv)
  cipher.setAAD(Buffer.from(`naruvi:settings:v1:${context}`))
  const ciphertext = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()])
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), ciphertext.toString("base64url")].join(".")
}

export function decryptSecret(encrypted: string, key: string, context: string): string {
  const bytes = keyBytes(key)
  try {
    const parts = encrypted.split(".")
    if (parts.length !== 4 || parts[0] !== "v1" || parts.slice(1).some((part) => !/^[\w-]+$/.test(part))) throw new Error()
    const [, nonce, tag, payload] = parts
    const iv = Buffer.from(nonce, "base64url")
    const authTag = Buffer.from(tag, "base64url")
    if (iv.length !== 12 || authTag.length !== 16) throw new Error()
    const decipher = createDecipheriv("aes-256-gcm", bytes, iv)
    decipher.setAAD(Buffer.from(`naruvi:settings:v1:${context}`))
    decipher.setAuthTag(authTag)
    return Buffer.concat([decipher.update(Buffer.from(payload, "base64url")), decipher.final()]).toString("utf8")
  } catch {
    throw new SettingsError("The saved API key could not be decrypted. Restore the original SETTINGS_ENCRYPTION_KEY or replace the API key in Settings.")
  }
}
