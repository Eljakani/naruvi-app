"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Building2Icon, CheckCircle2Icon, WalletIcon } from "lucide-react"
import { toast } from "sonner"
import { saveSalaryDataAction, setCompanyFactsAction } from "@/app/[locale]/(app)/integrations/actions"
import ParticleButton from "@/components/kokonutui/particle-button"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { useTranslations } from "next-intl"

const secretProps = { autoComplete: "new-password", "data-1p-ignore": true, "data-lpignore": "true", "data-form-type": "other" } as const

export function CompanyFactsSettings({ enabled }: { enabled: boolean }) {
  const t = useTranslations("integrations.market")
  const [on, setOn] = useState(enabled)
  const [, startTransition] = useTransition()
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Building2Icon className="size-4" /> {t("facts")}</CardTitle>
        <CardDescription>{t("factsBody")}</CardDescription>
        <CardAction>
          <Switch
            checked={on}
            aria-label={t("factsLabel")}
            onCheckedChange={(value) => {
              setOn(value)
              startTransition(async () => {
                await setCompanyFactsAction(value)
                toast(value ? t("factsOn") : t("factsOff"))
              })
            }}
          />
        </CardAction>
      </CardHeader>
    </Card>
  )
}

export function SalaryDataSettings({ configured, appId }: { configured: boolean; appId: string | null }) {
  const t = useTranslations("integrations.market")
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
        <CardTitle className="flex items-center gap-2"><WalletIcon className="size-4" /> {t("salary")}</CardTitle>
        <CardDescription>{t("salaryBody")}</CardDescription>
        {configured ? (
          <CardAction>
            <Badge variant="secondary" className="gap-1"><CheckCircle2Icon /> {t("ready")}</Badge>
          </CardAction>
        ) : null}
      </CardHeader>
      <CardContent className="grid gap-3 text-sm">
        <form className="flex flex-wrap gap-2" autoComplete="off" onSubmit={(event) => event.preventDefault()}>
          <Input className="min-w-40 flex-1" value={id} onChange={(event) => setId(event.target.value)} placeholder={appId ? t("appIdNow", { id: appId }) : t("appId")} aria-label={t("appIdLabel")} {...secretProps} />
          <Input className="min-w-40 flex-1" type="password" value={key} onChange={(event) => setKey(event.target.value)} placeholder={t("appKey")} aria-label={t("appKeyLabel")} {...secretProps} />
          <ParticleButton disabled={!id.trim() || !key.trim()} onClick={() => save({ appId: id, appKey: key })} pendingLabel={t("checking")} successLabel={t("saved")} errorLabel={t("tryAgain")}>
            {t("save")}
          </ParticleButton>
          {configured ? <Button type="button" variant="ghost" onClick={() => save({ appId: "", appKey: "" }).catch(() => undefined)}>{t("remove")}</Button> : null}
        </form>
        <p className="text-xs text-muted-foreground">{t("salaryPrivacy")}</p>
      </CardContent>
    </Card>
  )
}
