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
  const { runNotifications } = await import("@/server/integrations/notify")
  await runNotifications()
}
