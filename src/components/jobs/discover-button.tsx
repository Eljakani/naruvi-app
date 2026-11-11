"use client"

import { useTransition } from "react"
import { useRouter } from "next/navigation"
import { Loader2Icon, SparklesIcon } from "lucide-react"
import { toast } from "sonner"
import { discoverJobsAction } from "@/app/[locale]/(app)/jobs/actions"
import { Button } from "@/components/ui/button"
import { useTranslations } from "next-intl"

/**
 * Search the job boards from the profile (Apify); new postings show up in the
 * job leads. A search takes a minute or two, so its progress lives in a toast
 * that survives moving to another page.
 */
export function DiscoverButton() {
  const t = useTranslations("jobs.discover")
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  return (
    <Button
      variant="outline"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const id = toast.loading(t("searching"), { description: t("wait") })
          const result = await discoverJobsAction().catch(() => ({ ok: false as const, setup: false, message: t("failed") }))
          if (!result.ok && result.setup) return void toast.info(t("setup"), { id, description: t("setupHelp"), action: { label: t("setupOpen"), onClick: () => router.push("/integrations#job-discovery") } })
          if (!result.ok) return void toast.error(t("failed"), { id, description: result.message })
          const description = result.failed ? t("partial") : result.added ? t("where") : result.found ? t("seen") : undefined
          toast.success(result.added ? t("added", { count: result.added }) : t("none"), { id, description })
        })
      }
    >
      {pending ? <Loader2Icon className="animate-spin" /> : <SparklesIcon />} {t("button")}
    </Button>
  )
}
