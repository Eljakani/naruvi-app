import Link from "next/link"
import { Suspense } from "react"
import { BookOpenIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { connection } from "next/server"
import { SettingsView } from "@/components/settings/settings-view"
import { Skeleton } from "@/components/ui/skeleton"
import { getDocumentDefaults, getSystemOverview } from "@/server/settings/service"

export const metadata = { title: "Settings" }

export default function SettingsPage() {
  return (
    <div className="grid w-full min-w-0 gap-6">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <Button variant="outline" size="sm" nativeButton={false} render={<Link href="/setup" />}>
          <BookOpenIcon /> Setup guide
        </Button>
        <p className="col-span-2 text-sm text-muted-foreground">Manage AI providers, document defaults, and local data.</p>
      </div>
      <Suspense fallback={<Skeleton className="h-96 rounded-xl" />}>
        <Loader />
      </Suspense>
    </div>
  )
}

async function Loader() {
  await connection()
  const [overview, defaults] = await Promise.all([getSystemOverview(), getDocumentDefaults()])
  return <SettingsView overview={overview} defaults={defaults} />
}
