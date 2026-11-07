"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Building2Icon, CheckCircle2Icon, WalletIcon } from "lucide-react"
import { toast } from "sonner"
import { saveSalaryDataAction, setCompanyFactsAction } from "@/app/(app)/integrations/actions"
import ParticleButton from "@/components/kokonutui/particle-button"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"

const secretProps = { autoComplete: "new-password", "data-1p-ignore": true, "data-lpignore": "true", "data-form-type": "other" } as const

export function CompanyFactsSettings({ enabled }: { enabled: boolean }) {
  const [on, setOn] = useState(enabled)
  const [, startTransition] = useTransition()
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Building2Icon className="size-4" /> Company facts</CardTitle>
        <CardDescription>Fill company pages with size, founding year, headquarters and industry from Wikidata and the French business registry (Annuaire des entreprises). Free, no account. Only the company’s name and website are sent.</CardDescription>
        <CardAction>
          <Switch
            checked={on}
            aria-label="Look up company facts"
            onCheckedChange={(value) => {
              setOn(value)
              startTransition(async () => {
                await setCompanyFactsAction(value)
                toast(value ? "Company facts on" : "Company facts off")
              })
            }}
          />
        </CardAction>
      </CardHeader>
    </Card>
  )
}

export function SalaryDataSettings({ configured, appId }: { configured: boolean; appId: string | null }) {
  const router = useRouter()
  const [id, setId] = useState("")
  const [key, setKey] = useState("")
  const save = async (input: { appId: string; appKey: string }) => {
    const result = await saveSalaryDataAction(input)
    if (!result.ok) {
      toast.error(result.message)
      throw new Error(result.message)
    }
    setId("")
    setKey("")
    router.refresh()
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><WalletIcon className="size-4" /> Salary data</CardTitle>
        <CardDescription>Compare a job’s pay with what similar roles pay in the same city, using Adzuna’s market data (free key from developer.adzuna.com). Without it, jobs are still compared with the ones you saved, and link to Levels.fyi and Glassdoor.</CardDescription>
        {configured ? (
          <CardAction>
            <Badge variant="secondary" className="gap-1"><CheckCircle2Icon /> Ready</Badge>
          </CardAction>
        ) : null}
      </CardHeader>
      <CardContent className="grid gap-3 text-sm">
        <form className="flex flex-wrap gap-2" autoComplete="off" onSubmit={(event) => event.preventDefault()}>
          <Input className="min-w-40 flex-1" value={id} onChange={(event) => setId(event.target.value)} placeholder={appId ? `Application ID (now ${appId})` : "Application ID"} aria-label="Adzuna Application ID" {...secretProps} />
          <Input className="min-w-40 flex-1" type="password" value={key} onChange={(event) => setKey(event.target.value)} placeholder="Application key" aria-label="Adzuna Application key" {...secretProps} />
          <ParticleButton disabled={!id.trim() || !key.trim()} onClick={() => save({ appId: id, appKey: key })} pendingLabel="Checking" successLabel="Saved" errorLabel="Try again">
            Save
          </ParticleButton>
          {configured ? <Button type="button" variant="ghost" onClick={() => save({ appId: "", appKey: "" }).catch(() => undefined)}>Remove</Button> : null}
        </form>
        <p className="text-xs text-muted-foreground">Only the job title and city are sent, when you open a job. Results are kept for a week. Works for France, the UK, Germany, the US and 12 more countries.</p>
      </CardContent>
    </Card>
  )
}
