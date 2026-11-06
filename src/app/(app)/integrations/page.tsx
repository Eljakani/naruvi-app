import { Suspense } from "react"
import { headers } from "next/headers"
import { connection } from "next/server"
import { ApiSettings } from "@/components/integrations/api-settings"
import { CalendarSettings } from "@/components/integrations/calendar-settings"
import { EmailFinderSettings } from "@/components/integrations/email-finder-settings"
import { ExportSettings } from "@/components/integrations/export-settings"
import { emailFinderStatus } from "@/server/contacts/repository"
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
  const [mail, token, upcoming, head, notifications, keys, reply, oauth, finder] = await Promise.all([getMailOverview(), calendarToken(), datedNextSteps(), headers(), notificationOverview(), listApiKeys(), getReplySetting(), oauthClients(), emailFinderStatus()])
  const host = head.get("x-forwarded-host") ?? head.get("host") ?? "localhost:3000"
  const origin = `${head.get("x-forwarded-proto") ?? (/^(localhost|127\.|\[::1\])/.test(host) ? "http" : "https")}://${host}`
  const sections = [
    { id: "email", label: "Email", on: mail.connected, node: <MailSettings overview={mail} reply={reply} oauth={oauth} origin={origin} /> },
    { id: "calendar", label: "Calendar", on: Boolean(token), node: <CalendarSettings token={token} events={upcoming} origin={origin} /> },
    { id: "notifications", label: "Notifications", on: notifications.enabled, node: <NotificationSettings overview={notifications} /> },
    { id: "email-finder", label: "Email finder", on: finder.configured, node: <EmailFinderSettings configured={finder.configured} /> },
    { id: "api", label: "API & extension", on: keys.length > 0, node: <ApiSettings keys={keys} origin={origin} folder={process.cwd()} /> },
    { id: "export", label: "Export", on: null, node: <ExportSettings /> },
  ]
  return (
    <div className="grid gap-6 lg:grid-cols-[13rem_minmax(0,1fr)] lg:items-start">
      {/* Jump list: see at a glance what is connected, reach any section in one click. */}
      <nav aria-label="Integrations" className="flex gap-1 overflow-x-auto pb-1 lg:sticky lg:top-4 lg:grid lg:overflow-visible lg:pb-0">
        {sections.map((section) => (
          <a key={section.id} href={`#${section.id}`} className="flex shrink-0 items-center gap-2 rounded-md px-2.5 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
            <span className="flex-1 whitespace-nowrap">{section.label}</span>
            {section.on === null ? null : <span className={section.on ? "text-xs text-foreground" : "text-xs text-muted-foreground"}>{section.on ? "On" : "Off"}</span>}
          </a>
        ))}
      </nav>
      <div className="grid max-w-4xl gap-4">
        <OAuthResult />
        {sections.map((section) => (
          <div key={section.id} id={section.id} className="scroll-mt-4">{section.node}</div>
        ))}
      </div>
    </div>
  )
}
