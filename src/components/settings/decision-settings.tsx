"use client"

import Image from "next/image"
import { useState, useTransition } from "react"
import { ArrowUpRightIcon, Loader2Icon, PlugZapIcon } from "lucide-react"
import { toast } from "sonner"
import { saveDecisionSettingsAction, testDecisionModelAction } from "@/app/(app)/settings/actions"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import type { DecisionOverview } from "@/server/settings/decisions"

/** TypeSafe Jev key and model: classification and verification, never writing. */
export function DecisionSettings({ initial }: { initial: DecisionOverview }) {
  const [saved, setSaved] = useState(initial)
  const [model, setModel] = useState(initial.model)
  const [apiKey, setApiKey] = useState("")
  const [pending, startTransition] = useTransition()
  const [busy, setBusy] = useState<"save" | "test" | "remove" | null>(null)

  const save = (removeKey = false) => {
    if (pending) return
    setBusy(removeKey ? "remove" : "save")
    startTransition(async () => {
      try {
        const result = await saveDecisionSettingsAction({ model, apiKey, removeKey })
        if (!result.ok) return void toast.error(result.message)
        setSaved(result.overview)
        setModel(result.overview.model)
        setApiKey("")
        toast.success(removeKey ? "Decision model key removed" : "Decision model saved")
      } catch {
        toast.error("Could not save the decision model. Try again.")
      } finally {
        setBusy(null)
      }
    })
  }
  const test = () => {
    setBusy("test")
    startTransition(async () => {
      try {
        const result = await testDecisionModelAction()
        if (result.ok) toast.success(result.message ?? "Connected")
        else toast.error(result.message ?? "Test failed")
      } catch {
        toast.error("Could not test the connection. Try again.")
      } finally {
        setBusy(null)
      }
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle><h3 className="flex items-center gap-2"><Image src="/provider-logos/typesafe.png?v=1" alt="" aria-hidden width={20} height={20} unoptimized className="size-5 shrink-0 rounded-full" /> Decision model <span className="text-xs font-normal text-muted-foreground">· TypeSafe Jev</span></h3></CardTitle>
        <CardDescription>
          Optionally use TypeSafe Jev to filter job requirements, match profile facts, enrich imported jobs, and check claims in drafts.
        </CardDescription>
        <CardAction>
          <Badge variant={saved.configured ? "default" : "secondary"}>{saved.configured ? "Connected" : "Off"}</Badge>
        </CardAction>
      </CardHeader>
      <CardContent>
        <form
          onSubmit={(event) => {
            event.preventDefault()
            save()
          }}
        >
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="jev-model">Model</FieldLabel>
              <Input id="jev-model" value={model} onChange={(event) => setModel(event.target.value)} disabled={pending} autoCapitalize="none" spellCheck={false} />
              <FieldDescription>Use jev-latest or enter a specific version.</FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="jev-key">API key</FieldLabel>
              <Input id="jev-key" type="password" autoComplete="new-password" disabled={pending} value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder={saved.hasKey ? "Leave blank to keep the current key" : "Paste your TypeSafe API key"} />
              <FieldDescription>Keys are stored encrypted. Without a key, Naruvi uses the language model or built-in rules.</FieldDescription>
              <a href="https://console.typesafe.ai/keys" target="_blank" rel="noreferrer" className="inline-flex w-fit items-center gap-1 text-sm font-medium underline underline-offset-4">
                Get a TypeSafe API key <ArrowUpRightIcon className="size-3.5" aria-hidden />
              </a>
            </Field>
            <div className="flex flex-wrap gap-2 border-t pt-4">
              <Button type="submit" disabled={pending || (!apiKey && model === saved.model)}>
                {busy === "save" ? <Loader2Icon className="animate-spin motion-reduce:animate-none" /> : null} Save model
              </Button>
              <Button type="button" variant="outline" disabled={pending || !saved.configured} onClick={test}>
                {busy === "test" ? <Loader2Icon className="animate-spin motion-reduce:animate-none" /> : <PlugZapIcon />} Test saved model
              </Button>
              {saved.keySource === "database" ? (
                <Button type="button" variant="ghost" disabled={pending || Boolean(apiKey)} onClick={() => save(true)}>
                  {busy === "remove" ? <Loader2Icon className="animate-spin motion-reduce:animate-none" /> : null} Remove key
                </Button>
              ) : null}
            </div>
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  )
}
