import { createHash, randomBytes, scrypt, timingSafeEqual } from "node:crypto"
export class AuthBusyError extends Error {}
let active = 0
const derive = async (password: string, salt: string) => {
  if (active >= 2) throw new AuthBusyError("Authentication is busy")
  active++
  try { return await new Promise<Buffer>((resolve, reject) => {
  scrypt(password, salt, 64, { N: 131072, r: 8, p: 1, maxmem: 256 * 1024 * 1024 }, (error, key) => error ? reject(error) : resolve(key))
}) } finally { active-- }
}
export const token = () => randomBytes(32).toString("hex")
export const digest = (value: string) => createHash("sha256").update(value).digest("hex")
export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex")
  const key = await derive(password, salt)
  return `${salt}:${key.toString("hex")}`
}
export async function verifyPassword(password: string, stored: string) {
  const [salt, hex] = stored.split(":")
  if (!/^[a-f0-9]{32}$/.test(salt) || !/^[a-f0-9]{128}$/.test(hex ?? "")) return false
  const key = await derive(password, salt)
  return timingSafeEqual(key, Buffer.from(hex, "hex"))
}

export const DUMMY_PASSWORD_HASH = `${"0".repeat(32)}:${"0".repeat(128)}`
