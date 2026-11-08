import { Suspense } from "react"
import { headers } from "next/headers"
import { connection } from "next/server"
import { ApiSettings } from "@/components/integrations/api-settings"
import { ModelSettings } from "@/components/settings/model-settings"
import { DecisionSettings } from "@/components/settings/decision-settings"
import { DictationSettings } from "@/components/settings/dictation-settings"
import { getLlmOverview } from "@/server/settings/llm"
import { getDecisionOverview } from "@/server/settings/decisions"
import { getSpeechOverview } from "@/server/settings/speech"
import { CalendarSettings } from "@/components/integrations/calendar-settings"
import { EmailFinderSettings } from "@/components/integrations/email-finder-settings"
import { ExportSettings } from "@/components/integrations/export-settings"
import { emailFinderStatus } from "@/server/contacts/repository"
import { CompanyFactsSettings, SalaryDataSettings } from "@/components/integrations/market-data-settings"
import { companyFactsEnabled } from "@/server/companies/profile"
import { salaryDataStatus } from "@/server/salary/market"
import { listApiKeys } from "@/server/integrations/api"
import { MailSettings } from "@/components/integrations/mail-settings"
import { OAuthResult } from "@/components/integrations/oauth-signin"
import { NotificationSettings } from "@/components/integrations/notification-settings"
import { notificationOverview } from "@/server/integrations/notify"
import { calendarToken, datedNextSteps } from "@/server/integrations/calendar"
import { AudioLinesIcon, BellIcon, BotIcon, Building2Icon, ScanSearchIcon, CalendarDaysIcon, WalletIcon, MailIcon, MailSearchIcon, PuzzleIcon, SheetIcon } from "lucide-react"
import { PageHeader } from "@/components/page-header"
import { SectionLayout, SectionNav, SettingsSection } from "@/components/section-nav"
import { Skeleton } from "@/components/ui/skeleton"
import { getMailOverview, getReplySetting } from "@/server/mail/account"
import { oauthClients } from "@/server/mail/oauth"

export const metadata = { title: "Integrations" }

export default function IntegrationsPage() {
  return (
    <>
      <PageHeader title="Integrations" description="Connect Naruvi to AI models, your mailbox, calendar and other tools." />
      <Suspense fallback={<Skeleton className="h-96 rounded-xl" />}>
        <Integrations />
      </Suspense>
    </>
  )
}

async function Integrations() {
  await connection()
  const [mail, token, upcoming, head, notifications, keys, reply, oauth, finder] = await Promise.all([getMailOverview(), calendarToken(), datedNextSteps(), headers(), notificationOverview(), listApiKeys(), getReplySetting(), oauthClients(), emailFinderStatus()])
  const [factsOn, salary, llm, decisions, speech] = await Promise.all([companyFactsEnabled(), salaryDataStatus(), getLlmOverview(), getDecisionOverview(), getSpeechOverview()])
  const host = head.get("x-forwarded-host") ?? head.get("host") ?? "localhost:3000"
  const origin = `${head.get("x-forwarded-proto") ?? (/^(localhost|127\.|\[::1\])/.test(host) ? "http" : "https")}://${host}`
  const items = [
    { id: "language-model", label: "Language model", icon: <BotIcon />, status: llm.configured },
    { id: "decision-model", label: "Decision model", icon: <ScanSearchIcon />, status: decisions.configured },
    { id: "dictation", label: "Dictation", icon: <AudioLinesIcon />, status: speech.configured ? true : null },
    { id: "email", label: "Email", icon: <MailIcon />, status: mail.connected },
    { id: "calendar", label: "Calendar", icon: <CalendarDaysIcon />, status: Boolean(token) },
    { id: "notifications", label: "Notifications", icon: <BellIcon />, status: notifications.enabled },
    { id: "email-finder", label: "Email finder", icon: <MailSearchIcon />, status: finder.configured },
    { id: "company-facts", label: "Company facts", icon: <Building2Icon />, status: factsOn },
    { id: "salary-data", label: "Salary data", icon: <WalletIcon />, status: salary.configured },
    { id: "api", label: "API & extension", icon: <PuzzleIcon />, status: keys.length > 0 },
    { id: "export", label: "Export", icon: <SheetIcon />, status: null },
  ]
  return (
    <SectionLayout nav={<SectionNav label="Integrations" items={items} />}>
      <OAuthResult />
      <SettingsSection id="ai" title="AI models" description="AI features send relevant job text, verified profile facts, and available company research to the provider you choose.">
        <div id="language-model" className="scroll-mt-6"><ModelSettings initial={llm} /></div>
        <div id="decision-model" className="scroll-mt-6"><DecisionSettings initial={decisions} /></div>
        <div id="dictation" className="scroll-mt-6"><DictationSettings speech={speech} /></div>
      </SettingsSection>
      <SettingsSection id="stay-in-touch" title="Mail and reminders" description="Replies linked to your applications, next steps in your calendar, and a nudge on your phone.">
        <div id="email" className="scroll-mt-6"><MailSettings overview={mail} reply={reply} oauth={oauth} origin={origin} /></div>
        <div id="calendar" className="scroll-mt-6"><CalendarSettings token={token} events={upcoming} origin={origin} /></div>
        <div id="notifications" className="scroll-mt-6"><NotificationSettings overview={notifications} /></div>
      </SettingsSection>
      <SettingsSection id="people-tools" title="Reaching people" description="Find a recruiter’s work email from their name and company.">
        <div id="email-finder" className="scroll-mt-6"><EmailFinderSettings configured={finder.configured} /></div>
      </SettingsSection>
      <SettingsSection id="research-data" title="Companies and pay" description="Public facts on company pages, and what similar roles pay on job pages.">
        <div id="company-facts" className="scroll-mt-6"><CompanyFactsSettings enabled={factsOn} /></div>
        <div id="salary-data" className="scroll-mt-6"><SalaryDataSettings configured={salary.configured} appId={salary.appId} /></div>
      </SettingsSection>
      <SettingsSection id="connect" title="Extension, API and export" description="Save jobs from your browser, let an AI assistant or your scripts use Naruvi, or take your data elsewhere.">
        <div id="api" className="scroll-mt-6"><ApiSettings keys={keys} origin={origin} folder={process.cwd()} /></div>
        <div id="export" className="scroll-mt-6"><ExportSettings /></div>
      </SettingsSection>
    </SectionLayout>
  )
}
