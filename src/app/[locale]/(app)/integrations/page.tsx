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
import { titled } from "@/i18n/metadata"
import { useTranslations } from "next-intl"
import { getTranslations } from "next-intl/server"

export const generateMetadata = titled("integrations")

export default function IntegrationsPage() {
  const t = useTranslations("integrations")
  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />
      <Suspense fallback={<Skeleton className="h-96 rounded-xl" />}>
        <Integrations />
      </Suspense>
    </>
  )
}

async function Integrations() {
  const t = await getTranslations("integrations")
  await connection()
  const [mail, token, upcoming, head, notifications, keys, reply, oauth, finder] = await Promise.all([getMailOverview(), calendarToken(), datedNextSteps(), headers(), notificationOverview(), listApiKeys(), getReplySetting(), oauthClients(), emailFinderStatus()])
  const [factsOn, salary, llm, decisions, speech] = await Promise.all([companyFactsEnabled(), salaryDataStatus(), getLlmOverview(), getDecisionOverview(), getSpeechOverview()])
  const host = head.get("x-forwarded-host") ?? head.get("host") ?? "localhost:3000"
  const origin = `${head.get("x-forwarded-proto") ?? (/^(localhost|127\.|\[::1\])/.test(host) ? "http" : "https")}://${host}`
  const items = [
    { id: "language-model", label: t("nav.llm"), icon: <BotIcon />, status: llm.configured },
    { id: "decision-model", label: t("nav.decision"), icon: <ScanSearchIcon />, status: decisions.configured },
    { id: "dictation", label: t("nav.dictation"), icon: <AudioLinesIcon />, status: speech.configured ? true : null },
    { id: "email", label: t("nav.email"), icon: <MailIcon />, status: mail.connected },
    { id: "calendar", label: t("nav.calendar"), icon: <CalendarDaysIcon />, status: Boolean(token) },
    { id: "notifications", label: t("nav.notifications"), icon: <BellIcon />, status: notifications.enabled },
    { id: "email-finder", label: t("nav.finder"), icon: <MailSearchIcon />, status: finder.configured },
    { id: "company-facts", label: t("nav.facts"), icon: <Building2Icon />, status: factsOn },
    { id: "salary-data", label: t("nav.salary"), icon: <WalletIcon />, status: salary.configured },
    { id: "api", label: t("nav.api"), icon: <PuzzleIcon />, status: keys.length > 0 },
    { id: "export", label: t("nav.export"), icon: <SheetIcon />, status: null },
  ]
  return (
    <SectionLayout nav={<SectionNav label={t("title")} items={items} />}>
      <OAuthResult />
      <SettingsSection id="ai" title={t("sections.ai.title")} description={t("sections.ai.description")}>
        <div id="language-model" className="scroll-mt-6"><ModelSettings initial={llm} /></div>
        <div id="decision-model" className="scroll-mt-6"><DecisionSettings initial={decisions} /></div>
        <div id="dictation" className="scroll-mt-6"><DictationSettings speech={speech} /></div>
      </SettingsSection>
      <SettingsSection id="stay-in-touch" title={t("sections.mail.title")} description={t("sections.mail.description")}>
        <div id="email" className="scroll-mt-6"><MailSettings overview={mail} reply={reply} oauth={oauth} origin={origin} /></div>
        <div id="calendar" className="scroll-mt-6"><CalendarSettings token={token} events={upcoming} origin={origin} /></div>
        <div id="notifications" className="scroll-mt-6"><NotificationSettings overview={notifications} /></div>
      </SettingsSection>
      <SettingsSection id="people-tools" title={t("sections.people.title")} description={t("sections.people.description")}>
        <div id="email-finder" className="scroll-mt-6"><EmailFinderSettings configured={finder.configured} /></div>
      </SettingsSection>
      <SettingsSection id="research-data" title={t("sections.research.title")} description={t("sections.research.description")}>
        <div id="company-facts" className="scroll-mt-6"><CompanyFactsSettings enabled={factsOn} /></div>
        <div id="salary-data" className="scroll-mt-6"><SalaryDataSettings configured={salary.configured} appId={salary.appId} /></div>
      </SettingsSection>
      <SettingsSection id="connect" title={t("sections.connect.title")} description={t("sections.connect.description")}>
        <div id="api" className="scroll-mt-6"><ApiSettings keys={keys} origin={origin} folder={process.cwd()} /></div>
        <div id="export" className="scroll-mt-6"><ExportSettings /></div>
      </SettingsSection>
    </SectionLayout>
  )
}
