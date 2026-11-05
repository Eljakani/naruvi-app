import { randomBytes } from "node:crypto"
import { chmod, readFile, writeFile } from "node:fs/promises"
import { parse } from "dotenv"
import { encryptionReady } from "../src/server/settings/encryption"

const path = process.argv[2] ?? ".env.local"
if (![".env.local", ".env"].includes(path)) throw new Error("Choose .env.local (development) or .env (Docker Compose).")
let contents: string
try { contents = await readFile(path, "utf8") } catch (error) {
  if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
  contents = ""
}
const existing = parse(contents).SETTINGS_ENCRYPTION_KEY
if (existing) {
  if (!encryptionReady(existing)) throw new Error("SETTINGS_ENCRYPTION_KEY already exists but is invalid. It must contain 64 hex characters. It was not changed.")
  console.log(`${path} already has an encryption key; left it unchanged.`)
} else {
  const line = `SETTINGS_ENCRYPTION_KEY=${randomBytes(32).toString("hex")}`
  const assignment = /^(?:export\s+)?SETTINGS_ENCRYPTION_KEY\s*=.*$/gm
  const next = assignment.test(contents) ? contents.replace(assignment, line) : `${contents}${contents.endsWith("\n") || !contents ? "" : "\n"}${line}\n`
  await writeFile(path, next, { mode: 0o600 })
  await chmod(path, 0o600)
  console.log(`Created the encryption key in ${path}. Keep this file private and back up the key with your database. Restart the app if it is running.`)
}
