import Link from "next/link"
import { Suspense } from "react"
import { BookOpenIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { PageHeader } from "@/components/page-header"
import { connection } from "next/server"
import { SettingsView } from "@/components/settings/settings-view"
import { Skeleton } from "@/components/ui/skeleton"
import { getDocumentDefaults, getSystemOverview } from "@/server/settings/service"
import { getAvailableUpdate, getChangelog } from "@/server/version"
import { getAutomationSettings } from "@/server/settings/automation"
import { useTranslations } from "next-intl"
import { getTranslations } from "next-intl/server"

export async function generateMetadata() {
  return { title: (await getTranslations("nav.items"))("settings.title") }
}

export default function SettingsPage() {
  const t = useTranslations("settings")
  return (
    <>
      <PageHeader
        title={t("title")}
        description={t("description")}
        actions={<Button variant="outline" size="sm" nativeButton={false} render={<Link href="/setup" />}><BookOpenIcon /> {t("setupGuide")}</Button>}
      />
      <Suspense fallback={<Skeleton className="h-96 rounded-xl" />}>
        <Loader />
      </Suspense>
    </>
  )
}

async function Loader() {
  await connection()
  const [overview, defaults, changelog, update, automation] = await Promise.all([getSystemOverview(), getDocumentDefaults(), getChangelog(), getAvailableUpdate(), getAutomationSettings()])
  return <SettingsView overview={overview} defaults={defaults} changelog={changelog} update={update} automation={automation} />
}
