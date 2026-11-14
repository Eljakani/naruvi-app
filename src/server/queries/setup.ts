import "server-only"
import { count, eq } from "drizzle-orm"
import { env } from "@/lib/env"
import { db } from "@/server/db/client"
import { entries, facts, jobs, mailAccounts, profiles, settings } from "@/server/db/schema"
import { getDecisionOverview } from "@/server/settings/decisions"
import { getLlmOverview } from "@/server/settings/llm"
import { encryptionReady } from "@/server/settings/encryption"

const SETUP_KEY = "setup"
type SetupChoices = { skipped?: boolean; decisionDismissed?: boolean }

/** What the owner chose to leave for later; nothing here is ever required. */
export async function setupChoices(): Promise<SetupChoices> {
  const row = await db.query.settings.findFirst({ where: eq(settings.key, SETUP_KEY) })
  const value = (row?.value ?? {}) as SetupChoices
  return { skipped: value.skipped === true, decisionDismissed: value.decisionDismissed === true }
}

export async function saveSetupChoices(patch: SetupChoices) {
  const value = { ...(await setupChoices()), ...patch }
  await db.insert(settings).values({ key: SETUP_KEY, value }).onConflictDoUpdate({ target: settings.key, set: { value } })
}

/** Where a new install stands: the few steps that matter, in order, and the extras that can wait. */
export async function setupStatus() {
  const [[profile], [verified], [jobCount], [mailbox], themeRow, apiRow, llm, decision, choices] = await Promise.all([
    db.select({ name: profiles.fullName }).from(profiles).limit(1),
    db.select({ n: count() }).from(facts).innerJoin(entries, eq(facts.entryId, entries.id)).where(eq(entries.status, "verified")),
    db.select({ n: count() }).from(jobs),
    db.select({ n: count() }).from(mailAccounts),
    db.query.settings.findFirst({ where: eq(settings.key, "documents") }),
    db.query.settings.findFirst({ where: eq(settings.key, "integration.api") }),
    getLlmOverview(),
    getDecisionOverview(),
    setupChoices(),
  ])
  const security = encryptionReady(env.SETTINGS_ENCRYPTION_KEY)
  const steps = {
    model: llm.configured,
    profile: Boolean(profile?.name?.trim()) && verified.n > 0,
    job: jobCount.n > 0,
  }
  const extras = {
    decision: decision.configured,
    look: Boolean(themeRow),
    email: mailbox.n > 0,
    extension: Boolean((apiRow?.value as { tokens?: unknown[] } | undefined)?.tokens?.length),
  }
  const done = Object.values(steps).filter(Boolean).length
  let llmOnOpenRouter = false
  try { llmOnOpenRouter = llm.configured && llm.hasKey && new URL(llm.baseUrl).hostname === "openrouter.ai" } catch {}
  return { steps, extras, security, done, total: Object.keys(steps).length, llm, decision, llmOnOpenRouter, choices, verifiedFacts: verified.n, fresh: !profile && jobCount.n === 0 }
}
