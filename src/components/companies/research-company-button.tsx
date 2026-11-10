"use client"

import { useState, useTransition } from "react"
import { Loader2Icon, RefreshCwIcon, SearchIcon } from "lucide-react"
import { toast } from "sonner"
import { researchCompanyAction, setCompanyWebsiteAction } from "@/app/[locale]/(app)/companies/actions"
import { WebsiteDialog } from "@/components/companies/company-dialogs"
import { Button } from "@/components/ui/button"
import { useTranslations } from "next-intl"

export function ResearchCompanyButton({ companyId, name, website, researched }: { companyId: string; name: string; website: string | null; researched: boolean }) {
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const t = useTranslations("research")
  const research = async () => {
    const result = await researchCompanyAction(companyId)
    if (!result.ok) {
      toast.error(t("failed"), { description: result.message })
      return false
    }
    if (result.data.items) toast.success(t("updated"), { description: t("updatedBody", { count: result.data.sources, name }) })
    else toast.info(t("nothing"), { description: t("nothingBody") })
    return true
  }
  return (
    <>
      <Button variant={researched ? "outline" : "default"} disabled={pending} aria-busy={pending} onClick={() => {
        if (!website) setOpen(true)
        else startTransition(async () => { await research() })
      }}>
        {pending ? <Loader2Icon className="animate-spin" /> : researched ? <RefreshCwIcon /> : <SearchIcon />}
        {pending ? t("researching") : researched ? t("refresh") : t("research")}
      </Button>
      <WebsiteDialog open={open} onOpenChange={setOpen} companyName={name} reason={t("reason")} onSubmit={async (value) => {
        const result = await setCompanyWebsiteAction(companyId, value)
        if (!result.ok) {
          toast.error(result.message)
          return false
        }
        return research()
      }} />
    </>
  )
}
