"use client"

import UndoButton from "@/components/kokonutui/undo-button"
import { useState, useTransition } from "react"
import { CheckIcon, CopyIcon, KeyRoundIcon, Loader2Icon, PlusIcon, PuzzleIcon, TrashIcon } from "lucide-react"
import { toast } from "sonner"
import { createApiKeyAction, revokeApiKeyAction } from "@/app/[locale]/(app)/integrations/actions"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { useLocale, useTranslations } from "next-intl"

type Key = { id: string; name: string; prefix: string; createdAt: string; lastUsedAt: string | null }


/** API keys for the browser extension, the MCP server and your own scripts. */
export function ApiSettings({ keys, origin, folder }: { keys: Key[]; origin: string; folder: string }) {
  const t = useTranslations("integrations.api")
  const locale = useLocale()
  const date = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric" }) : t("never"))
  const [name, setName] = useState("")
  const [created, setCreated] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [pending, startTransition] = useTransition()

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <PuzzleIcon className="size-4" /> {t("title")}
        </CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-5 text-sm">
        <section className="grid gap-2">
          <h2 className="font-medium">{t("keys")}</h2>
          {created ? (
            <Alert>
              <KeyRoundIcon />
              <AlertTitle>{t("copyNow")}</AlertTitle>
              <AlertDescription className="grid gap-2">
                <p>{t("once")}</p>
                <div className="flex gap-2">
                  <Input readOnly value={created} className="font-mono text-xs" onFocus={(event) => event.currentTarget.select()} aria-label={t("newKey")} />
                  <Button
                    variant="outline"
                    onClick={async () => {
                      await navigator.clipboard.writeText(created)
                      setCopied(true)
                      setTimeout(() => setCopied(false), 1500)
                    }}
                  >
                    {copied ? <CheckIcon /> : <CopyIcon />} {copied ? t("copied") : t("copy")}
                  </Button>
                </div>
              </AlertDescription>
            </Alert>
          ) : null}
          {keys.length ? (
            <ul className="divide-y rounded-lg border">
              {keys.map((key) => (
                <li key={key.id} className="flex flex-wrap items-center gap-3 px-3 py-2">
                  <KeyRoundIcon className="size-4 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{key.name}</p>
                    <p className="text-xs text-muted-foreground">
                      <span className="font-mono">{key.prefix}…</span> · {t("created", { date: date(key.createdAt) })} · {t("lastUsed", { date: date(key.lastUsedAt) })}
                    </p>
                  </div>
                  <UndoButton
                    label={t("revoke")}
                    doneLabel={t("revoked")}
                    icon={TrashIcon}
                    className="h-8"
                    resetAfter={null}
                    disabled={pending}
                    onCommit={() =>
                      startTransition(async () => {
                        await revokeApiKeyAction(key.id)
                        toast(t("revokedToast", { name: key.name }))
                      })
                    }
                  />
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-muted-foreground">{t("none")}</p>
          )}
          <form
            className="flex gap-2"
            onSubmit={(event) => {
              event.preventDefault()
              startTransition(async () => {
                const result = await createApiKeyAction(name || t("defaultName"))
                if (!result.ok) return void toast.error(result.message)
                setCreated(result.data.token)
                setName("")
              })
            }}
          >
            <Input value={name} onChange={(event) => setName(event.target.value)} placeholder={t("namePlaceholder")} aria-label={t("name")} maxLength={60} />
            <Button type="submit" disabled={pending}>
              {pending ? <Loader2Icon className="animate-spin" /> : <PlusIcon />} {t("create")}
            </Button>
          </form>
        </section>
        <div className="grid gap-2">
        <details className="group grid gap-2 rounded-lg border px-3 py-2 [&[open]]:pb-3">
          <summary className="cursor-pointer font-medium marker:text-muted-foreground">{t("ext.title")}</summary>
          <div className="mt-2 grid gap-2">
          <p className="text-muted-foreground">{t("ext.body")}</p>
          <ol className="grid list-decimal gap-1 ps-5 text-muted-foreground">
            <li>{t.rich("ext.step1", { code: (chunks) => <code className="rounded bg-muted px-1">{chunks}</code> })}</li>
            <li>{t.rich("ext.step2", { origin, code: (chunks) => <code className="rounded bg-muted px-1">{chunks}</code> })}</li>
          </ol>
          </div>
        </details>

        <details className="group grid gap-2 rounded-lg border px-3 py-2 [&[open]]:pb-3">
          <summary className="cursor-pointer font-medium marker:text-muted-foreground">{t("mcp.title")}</summary>
          <div className="mt-2 grid gap-2">
          <p className="text-muted-foreground">{t("mcp.body")}</p>
          <p className="text-xs text-muted-foreground">Claude Code:</p>
          <pre className="overflow-x-auto rounded-md bg-muted p-2 text-xs">{`claude mcp add naruvi -e NARUVI_URL=${origin} -e NARUVI_API_KEY=nrv_… -- node ${folder}/mcp/naruvi-mcp.mjs`}</pre>
          <p className="text-xs text-muted-foreground">{t("mcp.desktop")}</p>
          <pre className="overflow-x-auto rounded-md bg-muted p-2 text-xs">{JSON.stringify({ naruvi: { command: "node", args: [`${folder}/mcp/naruvi-mcp.mjs`], env: { NARUVI_URL: origin, NARUVI_API_KEY: "nrv_…" } } }, null, 2)}</pre>
          <p className="text-xs text-muted-foreground">{t.rich("mcp.scripts", { origin, code: (chunks) => <code className="rounded bg-muted px-1">{chunks}</code> })}</p>
          </div>
        </details>

        </div>
      </CardContent>
    </Card>
  )
}
