"use client"

import { useState, useTransition } from "react"
import { CheckIcon, CopyIcon, KeyRoundIcon, Loader2Icon, PlusIcon, PuzzleIcon, TrashIcon } from "lucide-react"
import { toast } from "sonner"
import { createApiKeyAction, revokeApiKeyAction } from "@/app/(app)/integrations/actions"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"

type Key = { id: string; name: string; prefix: string; createdAt: string; lastUsedAt: string | null }

const date = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "never")

/** API keys for the browser extension, the MCP server and your own scripts. */
export function ApiSettings({ keys, origin }: { keys: Key[]; origin: string }) {
  const [name, setName] = useState("")
  const [created, setCreated] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [pending, startTransition] = useTransition()

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <PuzzleIcon className="size-4" /> API &amp; browser extension
        </CardTitle>
        <CardDescription>Let the Save to Naruvi extension, an AI assistant (MCP) or your own scripts use Naruvi. Each key works until you revoke it.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-5 text-sm">
        <section className="grid gap-2">
          <h3 className="font-medium">Browser extension</h3>
          <p className="text-muted-foreground">One click sends the posting you’re looking at (including LinkedIn and other pages behind a login) to Job leads, then opens it here to check and save.</p>
          <ol className="grid list-decimal gap-1 pl-5 text-muted-foreground">
            <li>In Chrome, Edge or Brave open <code className="rounded bg-muted px-1">chrome://extensions</code>, turn on Developer mode, then Load unpacked and pick the <code className="rounded bg-muted px-1">extension</code> folder of Naruvi. Firefox: see extension/README.md.</li>
            <li>Create a key below and paste it, with <code className="rounded bg-muted px-1">{origin}</code>, in the extension’s options.</li>
          </ol>
        </section>

        <section className="grid gap-2">
          <h3 className="font-medium">API keys</h3>
          {created ? (
            <Alert>
              <KeyRoundIcon />
              <AlertTitle>Copy your new key now</AlertTitle>
              <AlertDescription className="grid gap-2">
                <p>It won’t be shown again. Naruvi only keeps a fingerprint of it.</p>
                <div className="flex gap-2">
                  <Input readOnly value={created} className="font-mono text-xs" onFocus={(event) => event.currentTarget.select()} aria-label="New API key" />
                  <Button
                    variant="outline"
                    onClick={async () => {
                      await navigator.clipboard.writeText(created)
                      setCopied(true)
                      setTimeout(() => setCopied(false), 1500)
                    }}
                  >
                    {copied ? <CheckIcon /> : <CopyIcon />} {copied ? "Copied" : "Copy"}
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
                      <span className="font-mono">{key.prefix}…</span> · created {date(key.createdAt)} · last used {date(key.lastUsedAt)}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-muted-foreground"
                    disabled={pending}
                    onClick={() =>
                      startTransition(async () => {
                        await revokeApiKeyAction(key.id)
                        toast(`Key “${key.name}” revoked`)
                      })
                    }
                  >
                    <TrashIcon /> Revoke
                  </Button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-muted-foreground">No keys yet.</p>
          )}
          <form
            className="flex gap-2"
            onSubmit={(event) => {
              event.preventDefault()
              startTransition(async () => {
                const result = await createApiKeyAction(name || "Browser extension")
                if (!result.ok) return void toast.error(result.message)
                setCreated(result.data.token)
                setName("")
              })
            }}
          >
            <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="What it’s for, e.g. Browser extension" aria-label="Key name" maxLength={60} />
            <Button type="submit" disabled={pending}>
              {pending ? <Loader2Icon className="animate-spin" /> : <PlusIcon />} Create key
            </Button>
          </form>
        </section>
      </CardContent>
    </Card>
  )
}
