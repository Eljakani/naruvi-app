/** Terminal-only owner recovery. Never accept credentials in argv or env variables. */
import { createInterface } from "node:readline/promises"
import { Writable } from "node:stream"
import { config } from "dotenv"

if (process.argv.includes("--help")) {
  console.log("Usage: npm run auth:reset-password\nPrompts privately for a new owner password and signs out all sessions. Requires terminal and database access.")
  process.exit(0)
}
if (process.argv.length > 2) { console.error("Do not pass passwords as arguments. Run without arguments."); process.exit(1) }
if (!process.stdin.isTTY || !process.stdout.isTTY) { console.error("Use an interactive terminal. For Docker, use docker compose exec without -T."); process.exit(1) }
config({ path: ".env.local", quiet: true })
config({ path: ".env", quiet: true })
if (!process.env.DATABASE_URL) { console.error("DATABASE_URL is required. Run from your Naruvi checkout or inside the app container."); process.exit(1) }
let close: (() => Promise<void>) | undefined
try {
  const { owner, resetOwnerPassword, closeAuth } = await import("../src/server/auth/store")
  const { hashPassword } = await import("../src/server/auth/crypto")
  close = closeAuth
  if (!await owner()) throw new Error("No owner account exists. Use the first-run setup link instead.")
  console.log("Reset the Naruvi owner password. All browser sessions will be signed out; API keys and workspace data are unchanged.")
  const silent = new Writable({ write(_chunk, _encoding, done) { done() } })
  const terminal = createInterface({ input: process.stdin, output: silent, terminal: true, historySize: 0 })
  const abort = new AbortController()
  terminal.on("SIGINT", () => abort.abort())
  terminal.once("close", () => abort.abort())
  let password = ""
  let confirmation = ""
  try {
    process.stdout.write("New password (16–128 characters, hidden): ")
    password = await terminal.question("", { signal: abort.signal })
    process.stdout.write("\nConfirm new password (hidden): ")
    confirmation = await terminal.question("", { signal: abort.signal })
    process.stdout.write("\n")
  } finally { terminal.close(); silent.destroy() }
  if (password.length < 16 || password.length > 128) throw new Error("Password must contain 16–128 characters. Nothing was changed.")
  if (password !== confirmation) throw new Error("Passwords did not match. Nothing was changed.")
  const hash = await hashPassword(password)
  password = confirmation = ""
  await resetOwnerPassword(hash)
  console.log("Password reset. All browser sessions revoked. Sign in with your existing username and new password.")
} catch (error) {
  const message = error instanceof Error ? error.message : "Reset failed"
  console.error(message.includes("Nothing was changed") || message.startsWith("No owner") ? message : "Password reset failed or was cancelled. Check database access and try again.")
  process.exitCode = 1
} finally { await close?.() }
