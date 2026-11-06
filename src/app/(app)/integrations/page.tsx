import { Suspense } from "react"
import { headers } from "next/headers"
import { connection } from "next/server"
import { ApiSettings } from "@/components/integrations/api-settings"
import { CalendarSettings } from "@/components/integrations/calendar-settings"
import { ExportSettings } from "@/components/integrations/export-settings"
import { listApiKeys } from "@/server/integrations/api"
import { MailSettings } from "@/components/integrations/mail-settings"
import { OAuthResult } from "@/components/integrations/oauth-signin"
import { NotificationSettings } from "@/components/integrations/notification-settings"
import { notificationOverview } from "@/server/integrations/notify"
import { calendarToken, datedNextSteps } from "@/server/integrations/calendar"
import { PageHeader } from "@/components/page-header"
import { Skeleton } from "@/components/ui/skeleton"
import { getMailOverview, getReplySetting } from "@/server/mail/account"
import { oauthClients } from "@/server/mail/oauth"

export const metadata = { title: "Integrations" }

export default function IntegrationsPage() {
  return (
    <>
      <PageHeader title="Integrations" description="Connect Naruvi to your email and other tools. Everything runs on this computer; nothing is shared unless you send it." />
      <Suspense fallback={<Skeleton className="h-96 rounded-xl" />}>
        <Integrations />
      </Suspense>
    </>
  )
}

async function Integrations() {
  await connection()
  const [mail, token, upcoming, head, notifications, keys, reply, oauth] = await Promise.all([getMailOverview(), calendarToken(), datedNextSteps(), headers(), notificationOverview(), listApiKeys(), getReplySetting(), oauthClients()])
  const host = head.get("x-forwarded-host") ?? head.get("host") ?? "localhost:3000"
  const origin = `${head.get("x-forwarded-proto") ?? (/^(localhost|127\.|\[::1\])/.test(host) ? "http" : "https")}://${host}`
  return (
    <div className="grid max-w-4xl gap-4">
      <OAuthResult />
      <MailSettings overview={mail} reply={reply} oauth={oauth} origin={origin} />
      <CalendarSettings token={token} events={upcoming} origin={origin} />
      <NotificationSettings overview={notifications} />
      <ApiSettings keys={keys} origin={origin} folder={process.cwd()} />
      <ExportSettings />
    </div>
  )
}
