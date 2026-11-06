import "server-only"
import { count, eq } from "drizzle-orm"
import { env } from "@/lib/env"
import { db } from "@/server/db/client"
import { entries, facts, jobs, mailAccounts, profiles, settings } from "@/server/db/schema"
import { getLlmOverview } from "@/server/settings/llm"
import { encryptionReady } from "@/server/settings/encryption"

/** Where a new install stands: what works already and what's left, in order. */
export async function setupStatus() {
  const [[profile], [verified], [jobCount], [mailbox], themeRow, apiRow, llm] = await Promise.all([
    db.select({ name: profiles.fullName }).from(profiles).limit(1),
    db.select({ n: count() }).from(facts).innerJoin(entries, eq(facts.entryId, entries.id)).where(eq(entries.status, "verified")),
    db.select({ n: count() }).from(jobs),
    db.select({ n: count() }).from(mailAccounts),
    db.query.settings.findFirst({ where: eq(settings.key, "documents") }),
    db.query.settings.findFirst({ where: eq(settings.key, "integration.api") }),
    getLlmOverview(),
  ])
  const steps = {
    security: encryptionReady(env.SETTINGS_ENCRYPTION_KEY),
    model: llm.configured,
    profile: Boolean(profile?.name?.trim()) && verified.n > 0,
    look: Boolean(themeRow),
    job: jobCount.n > 0,
  }
  const extras = { email: mailbox.n > 0, extension: Boolean((apiRow?.value as { tokens?: unknown[] } | undefined)?.tokens?.length) }
  const done = Object.values(steps).filter(Boolean).length
  return { steps, extras, done, total: Object.keys(steps).length, llm, verifiedFacts: verified.n, fresh: !profile && jobCount.n === 0 }
}
