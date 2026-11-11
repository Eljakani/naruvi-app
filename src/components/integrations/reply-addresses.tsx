"use client"

import { useState, useTransition } from "react"
import { Loader2Icon } from "lucide-react"
import { toast } from "sonner"
import { saveReplySettingAction } from "@/app/[locale]/(app)/integrations/actions"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { useTranslations } from "next-intl"

type Mode = "off" | "plus" | "domain"

/** Give each application its own reply address so replies are matched with certainty. */
export function ReplyAddresses({ email, initial }: { email: string; initial: { mode: Mode; domain?: string } }) {
  const t = useTranslations("integrations.reply")
  const [mode, setMode] = useState<Mode>(initial.mode)
  const [domain, setDomain] = useState(initial.domain ?? "")
  const [pending, startTransition] = useTransition()
  const [local, host] = email.split("@")
  const example = mode === "plus" ? `${local}+nrv-1a2b3c4d5e@${host}` : mode === "domain" ? `nrv-1a2b3c4d5e@${domain || "jobs.your-domain.com"}` : null
  const dirty = mode !== initial.mode || (mode === "domain" && domain !== (initial.domain ?? ""))
  return (
    <div className="grid gap-2 rounded-lg border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-medium text-foreground">{t("title")}</p>
          <p className="text-xs">{t("description")}</p>
        </div>
        <ToggleGroup aria-label={t("label")} variant="outline" size="sm" value={[mode]} onValueChange={(value) => value[0] && setMode(value[0] as Mode)}>
          <ToggleGroupItem value="off">{t("off")}</ToggleGroupItem>
          <ToggleGroupItem value="plus">{t("plus")}</ToggleGroupItem>
          <ToggleGroupItem value="domain">{t("domain")}</ToggleGroupItem>
        </ToggleGroup>
      </div>
      {mode === "plus" ? <p className="text-xs">{t("plusHint")}</p> : null}
      {mode === "domain" ? (
        <div className="grid gap-2 text-xs">
          <Input value={domain} onChange={(event) => setDomain(event.target.value)} placeholder="jobs.your-domain.com" aria-label={t("domainLabel")} className="max-w-sm" />
          <p>
            {t("forward", { email })}
          </p>
        </div>
      ) : null}
      {example ? <p className="text-xs">{t("example")} <code className="rounded bg-muted px-1">{example}</code></p> : null}
      {dirty ? (
        <Button
          size="sm"
          className="w-fit"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const result = await saveReplySettingAction({ mode, domain: mode === "domain" ? domain : undefined })
              if (!result.ok) toast.error(result.message)
              else toast.success(mode === "off" ? t("savedOff") : t("savedOn"), { description: mode === "off" ? undefined : t("savedOnBody") })
            })
          }
        >
          {pending ? <Loader2Icon className="animate-spin" /> : null} {t("save")}
        </Button>
      ) : null}
    </div>
  )
}
