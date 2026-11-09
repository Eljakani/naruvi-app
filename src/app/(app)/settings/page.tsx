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

export const metadata = { title: "Settings" }

export default function SettingsPage() {
  return (
    <>
      <PageHeader
        title="Settings"
        description="Document defaults, fonts and your local data."
        actions={<Button variant="outline" size="sm" nativeButton={false} render={<Link href="/setup" />}><BookOpenIcon /> Setup guide</Button>}
      />
      <Suspense fallback={<Skeleton className="h-96 rounded-xl" />}>
        <Loader />
      </Suspense>
    </>
  )
}

async function Loader() {
  await connection()
  const [overview, defaults, changelog, update] = await Promise.all([getSystemOverview(), getDocumentDefaults(), getChangelog(), getAvailableUpdate()])
  return <SettingsView overview={overview} defaults={defaults} changelog={changelog} update={update} />
}
