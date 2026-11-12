"use client"

import Link from "next/link"
import { useState, useTransition } from "react"
import { CheckIcon, Loader2Icon, PuzzleIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { createApiKeyAction } from "@/app/[locale]/(app)/integrations/actions"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"

/**
 * Approval page for the browser extension. The new key is only put in this
 * tab's page (a data attribute): the extension that opened the tab reads it
 * from there, so it never travels through a URL or another site.
 */
export function ExtensionConnect() {
  const t = useTranslations("integrations.extensionConnect")
  const [key, setKey] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const connect = () =>
    startTransition(async () => {
      setError(null)
      const result = await createApiKeyAction(t("keyName"))
      if (!result.ok) return void setError(result.message)
      setKey(result.data.token)
    })

  return (
    <div className="mx-auto grid w-full max-w-lg gap-4 py-8">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {key ? <CheckIcon className="size-5 text-brand" /> : <PuzzleIcon className="size-5" />} {key ? t("doneTitle") : t("title")}
          </CardTitle>
          <CardDescription>{key ? t("doneBody") : t("body")}</CardDescription>
        </CardHeader>
        {key ? (
          <CardContent>
            <div hidden data-naruvi-extension-key={key} />
            <p className="text-sm text-muted-foreground">{t("revokeHint")}</p>
          </CardContent>
        ) : (
          <>
            <CardContent className="grid gap-2 text-sm text-muted-foreground">
              <p>{t("can")}</p>
              <p>{t("notYou")}</p>
              {error ? <p role="alert" className="text-destructive">{error}</p> : null}
            </CardContent>
            <CardFooter className="justify-end gap-2 border-t">
              <Button variant="ghost" nativeButton={false} render={<Link href="/integrations#api" />}>{t("cancel")}</Button>
              <Button onClick={connect} disabled={pending}>
                {pending ? <Loader2Icon className="animate-spin" /> : <PuzzleIcon />} {t("connect")}
              </Button>
            </CardFooter>
          </>
        )}
      </Card>
    </div>
  )
}
