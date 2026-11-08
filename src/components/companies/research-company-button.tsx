"use client"

import { useState, useTransition } from "react"
import { Loader2Icon, RefreshCwIcon, SearchIcon } from "lucide-react"
import { toast } from "sonner"
import { researchCompanyAction, setCompanyWebsiteAction } from "@/app/(app)/companies/actions"
import { WebsiteDialog } from "@/components/companies/company-dialogs"
import { Button } from "@/components/ui/button"

export function ResearchCompanyButton({ companyId, name, website, researched }: { companyId: string; name: string; website: string | null; researched: boolean }) {
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const research = async () => {
    const result = await researchCompanyAction(companyId)
    if (!result.ok) {
      toast.error("Research failed", { description: result.message })
      return false
    }
    if (result.data.items) toast.success("Company research updated", { description: `AI overview based on ${result.data.sources} page${result.data.sources === 1 ? "" : "s"} from ${name}’s website.` })
    else toast.info("No company details found", { description: "The pages were readable but didn’t contain a usable overview, mission or values." })
    return true
  }
  return (
    <>
      <Button variant={researched ? "outline" : "default"} disabled={pending} aria-busy={pending} onClick={() => {
        if (!website) setOpen(true)
        else startTransition(async () => { await research() })
      }}>
        {pending ? <Loader2Icon className="animate-spin" /> : researched ? <RefreshCwIcon /> : <SearchIcon />}
        {pending ? "Researching company…" : researched ? "Refresh research" : "Research company"}
      </Button>
      <WebsiteDialog open={open} onOpenChange={setOpen} companyName={name} reason="Research reads the company’s own website for its overview, mission and values." onSubmit={async (value) => {
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
