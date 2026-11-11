import "server-only"
import { db } from "@/server/db/client"
import { mailAccounts } from "@/server/db/schema"

/** Everything that runs on the timer. Each task decides for itself whether there is work. */
export async function runBackgroundTasks() {
  const [account] = await db.select({ id: mailAccounts.id }).from(mailAccounts).limit(1)
  if (account) {
    const { syncMail } = await import("@/server/mail/sync")
    await syncMail().catch((error) => console.error("[naruvi] mail sync:", error instanceof Error ? error.message : error))
  }
  const { backfillGoalVerdicts } = await import("@/server/jobs/goals")
  await backfillGoalVerdicts().catch((error) => console.error("[naruvi] goal verdicts:", error instanceof Error ? error.message : error))
  const { checkDueCareers } = await import("@/server/jobs/careers")
  await checkDueCareers()
  const { discoverIfDue } = await import("@/server/jobs/discover")
  await discoverIfDue().catch((error) => console.error("[naruvi] job discovery:", error instanceof Error ? error.message : error))
  const { refreshRoleGroups } = await import("@/server/contacts/role-groups")
  await refreshRoleGroups().catch((error) => console.error("[naruvi] role groups:", error instanceof Error ? error.message : error))
  const { runNotifications } = await import("@/server/integrations/notify")
  await runNotifications()
}
