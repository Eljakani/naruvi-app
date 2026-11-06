import { Suspense } from "react"
import { connection } from "next/server"
import { MailSettings } from "@/components/integrations/mail-settings"
import { PageHeader } from "@/components/page-header"
import { Skeleton } from "@/components/ui/skeleton"
import { getMailOverview } from "@/server/mail/account"

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
  const mail = await getMailOverview()
  return (
    <div className="grid max-w-4xl gap-4">
      <MailSettings overview={mail} />
    </div>
  )
}
