import "server-only"
import { z } from "zod"
import { db } from "@/server/db/client"
import { settings } from "@/server/db/schema"

/** What Naruvi does on its own. Every switch defaults to on. */
export const automationSettings = z.object({
  /** Check the fit as soon as a job is added to Applications. */
  autoFitCheck: z.boolean().catch(true).default(true),
})
const automationPatch = z.object({ autoFitCheck: z.boolean().optional() }).strict()
export type AutomationSettings = z.infer<typeof automationSettings>

export async function getAutomationSettings(): Promise<AutomationSettings> {
  const row = await db.query.settings.findFirst({ where: (t, { eq }) => eq(t.key, "automation") })
  return automationSettings.parse(row?.value ?? {})
}

export async function saveAutomationSettings(input: Partial<AutomationSettings>) {
  const value = automationSettings.parse({ ...(await getAutomationSettings()), ...automationPatch.parse(input) })
  await db.insert(settings).values({ key: "automation", value }).onConflictDoUpdate({ target: settings.key, set: { value } })
  return value
}
