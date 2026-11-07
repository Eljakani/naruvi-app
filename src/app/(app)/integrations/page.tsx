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
import { BellIcon, CalendarDaysIcon, MailIcon, MailSearchIcon, PuzzleIcon, SheetIcon } from "lucide-react"
import { PageHeader } from "@/components/page-header"
import { SectionLayout, SectionNav, SettingsSection } from "@/components/section-nav"
import { Skeleton } from "@/components/ui/skeleton"
import { getMailOverview, getReplySetting } from "@/server/mail/account"
import { oauthClients } from "@/server/mail/oauth"

export const metadata = { title: "Integrations" }

export default function IntegrationsPage() {
  return (
    <>
      <PageHeader title="Integrations" description="Connect Naruvi to your mailbox, calendar and other tools. Everything runs on this computer." />
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
  const items = [
    { id: "email", label: "Email", icon: <MailIcon />, status: mail.connected },
    { id: "calendar", label: "Calendar", icon: <CalendarDaysIcon />, status: Boolean(token) },
    { id: "notifications", label: "Notifications", icon: <BellIcon />, status: notifications.enabled },
    { id: "email-finder", label: "Email finder", icon: <MailSearchIcon />, status: finder.configured },
    { id: "api", label: "API & extension", icon: <PuzzleIcon />, status: keys.length > 0 },
    { id: "export", label: "Export", icon: <SheetIcon />, status: null },
  ]
  return (
    <SectionLayout nav={<SectionNav label="Integrations" items={items} />}>
      <OAuthResult />
      <SettingsSection id="stay-in-touch" title="Mail and reminders" description="Replies linked to your applications, next steps in your calendar, and a nudge on your phone.">
        <div id="email" className="scroll-mt-6"><MailSettings overview={mail} reply={reply} oauth={oauth} origin={origin} /></div>
        <div id="calendar" className="scroll-mt-6"><CalendarSettings token={token} events={upcoming} origin={origin} /></div>
        <div id="notifications" className="scroll-mt-6"><NotificationSettings overview={notifications} /></div>
      </SettingsSection>
      <SettingsSection id="people-tools" title="Reaching people" description="Find a recruiter’s work email from their name and company.">
        <div id="email-finder" className="scroll-mt-6"><EmailFinderSettings configured={finder.configured} /></div>
      </SettingsSection>
      <SettingsSection id="connect" title="Extension, API and export" description="Save jobs from your browser, let an AI assistant or your scripts use Naruvi, or take your data elsewhere.">
        <div id="api" className="scroll-mt-6"><ApiSettings keys={keys} origin={origin} folder={process.cwd()} /></div>
        <div id="export" className="scroll-mt-6"><ExportSettings /></div>
      </SettingsSection>
    </SectionLayout>
  )
}
