/** Prints a fresh one-time owner setup link. Replaces any earlier link. Requires database access. */
import { config } from "dotenv"

config({ path: ".env.local", quiet: true })
config({ path: ".env", quiet: true })
if (!process.env.DATABASE_URL) { console.error("DATABASE_URL is required. Run from your Naruvi checkout or inside the app container."); process.exit(1) }
const { issueSetupLink, closeAuth } = await import("../src/server/auth/store")
try {
  const link = await issueSetupLink()
  if (!link) { console.error("This workspace already has an owner. Sign in, or reset the password with auth:reset-password."); process.exitCode = 2 }
  else if (process.argv.includes("--raw")) console.log(link)
  else console.log(`\nCreate your owner account (one-time link, expires in 1 hour):\n${link}\n\nKeep this link private. Any earlier setup link no longer works.\n`)
} finally { await closeAuth() }
