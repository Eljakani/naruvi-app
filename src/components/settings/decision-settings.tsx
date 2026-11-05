"use client"

import { useState, useTransition } from "react"
import { Loader2Icon, PlugZapIcon } from "lucide-react"
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
    setBusy(removeKey ? "remove" : "save")
    startTransition(async () => {
      const result = await saveDecisionSettingsAction({ model, apiKey, removeKey })
      setBusy(null)
      if (!result.ok) return void toast.error(result.message)
      setSaved(result.overview)
      setApiKey("")
      toast.success(removeKey ? "Decision model key removed" : "Decision model saved")
    })
  }
  const test = () => {
    setBusy("test")
    startTransition(async () => {
      const result = await testDecisionModelAction()
      setBusy(null)
      if (result.ok) toast.success(result.message ?? "Connected")
      else toast.error(result.message ?? "Test failed")
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Decision model</CardTitle>
        <CardDescription>
          Optional. A TypeSafe Jev key moves classification work off the language model: it filters job requirements, matches them to your facts, enriches imported jobs and double-checks generated claims. It returns calibrated decisions, never text, so the language model still writes your CV and letters.
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
              <Input id="jev-model" value={model} onChange={(event) => setModel(event.target.value)} className="max-w-60 font-mono" />
              <FieldDescription>Use jev-latest, or pin a version like jev-1.14.0.</FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="jev-key">API key</FieldLabel>
              <Input id="jev-key" type="password" autoComplete="off" value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder={saved.hasKey ? "Saved — leave blank to keep" : "From console.typesafe.ai/keys"} />
              <FieldDescription>Stored encrypted. Without a key, the language model (or the built-in rules) does this work.</FieldDescription>
            </Field>
            <div className="flex flex-wrap gap-2">
              <Button type="submit" disabled={pending || (!apiKey && model === saved.model)}>
                {busy === "save" ? <Loader2Icon className="animate-spin" /> : null} Save
              </Button>
              <Button type="button" variant="outline" disabled={pending || !saved.configured} onClick={test}>
                {busy === "test" ? <Loader2Icon className="animate-spin" /> : <PlugZapIcon />} Test
              </Button>
              {saved.keySource === "database" ? (
                <Button type="button" variant="ghost" disabled={pending} onClick={() => save(true)}>
                  Remove key
                </Button>
              ) : null}
            </div>
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  )
}
