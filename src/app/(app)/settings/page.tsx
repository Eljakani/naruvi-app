import Link from "next/link"
import { Suspense } from "react"
import { BookOpenIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { PageHeader } from "@/components/page-header"
import { connection } from "next/server"
import { SettingsView } from "@/components/settings/settings-view"
import { Skeleton } from "@/components/ui/skeleton"
import { getDocumentDefaults, getSystemOverview } from "@/server/settings/service"

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
  const [overview, defaults] = await Promise.all([getSystemOverview(), getDocumentDefaults()])
  return <SettingsView overview={overview} defaults={defaults} />
}
