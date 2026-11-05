import { Suspense } from "react"
import { connection } from "next/server"
import { PageHeader } from "@/components/page-header"
import { SettingsView } from "@/components/settings/settings-view"
import { Skeleton } from "@/components/ui/skeleton"
import { getDocumentDefaults, getSystemOverview } from "@/server/settings/service"

export const metadata = { title: "Settings" }

export default function SettingsPage() {
  return (
    <>
      <PageHeader title="Settings" description="Your model, document defaults, fonts and data. AI assistance sends relevant job text, verified facts and available company research to your configured provider." />
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
