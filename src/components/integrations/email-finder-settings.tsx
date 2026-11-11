"use client"

import { useState, useTransition } from "react"
import { CheckCircle2Icon, Loader2Icon, MailSearchIcon } from "lucide-react"
import { toast } from "sonner"
import { saveEmailFinderAction } from "@/app/[locale]/(app)/contacts/actions"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { useTranslations } from "next-intl"

/** Find a contact's professional email from their name and company (Hunter.io, your own key). */
export function EmailFinderSettings({ configured }: { configured: boolean }) {
  const t = useTranslations("integrations.finder")
  const [key, setKey] = useState("")
  const [pending, startTransition] = useTransition()
  const save = (value: string) =>
    startTransition(async () => {
      const result = await saveEmailFinderAction(value)
      if (!result.ok) return void toast.error(result.message)
      setKey("")
      toast(value ? t("ready") : t("removed"))
    })
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MailSearchIcon className="size-4" /> {t("title")}
        </CardTitle>
        <CardDescription>{t("description")}</CardDescription>
        {configured ? (
          <CardAction>
            <Badge variant="secondary" className="gap-1"><CheckCircle2Icon /> {t("badge")}</Badge>
          </CardAction>
        ) : null}
      </CardHeader>
      <CardContent className="grid gap-3 text-sm">
        <form
          className="flex gap-2"
          autoComplete="off"
          onSubmit={(event) => {
            event.preventDefault()
            save(key)
          }}
        >
          <Input type="password" value={key} onChange={(event) => setKey(event.target.value)} placeholder={configured ? t("replaceKey") : t("key")} aria-label={t("key")} autoComplete="new-password" data-1p-ignore data-lpignore="true" data-form-type="other" />
          <Button type="submit" disabled={pending || !key.trim()}>
            {pending ? <Loader2Icon className="animate-spin" /> : null} {t("save")}
          </Button>
          {configured ? <Button type="button" variant="ghost" disabled={pending} onClick={() => save("")}>{t("remove")}</Button> : null}
        </form>
        <p className="text-xs text-muted-foreground">{t("privacy")}</p>
      </CardContent>
    </Card>
  )
}
