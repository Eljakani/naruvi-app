"use client"

import { useState, useTransition } from "react"
import { Loader2Icon, PlugZapIcon } from "lucide-react"
import { toast } from "sonner"
import { saveLlmSettingsAction, testLlmAction } from "@/app/(app)/settings/actions"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import type { LlmOverview } from "@/server/settings/llm"

export function ModelSettings({ initial }: { initial: LlmOverview }) {
  const [saved, setSaved] = useState(initial)
  const [baseUrl, setBaseUrl] = useState(initial.baseUrl)
  const [model, setModel] = useState(initial.model)
  const [apiKey, setApiKey] = useState("")
  const [removeKey, setRemoveKey] = useState(false)
  const [pending, startTransition] = useTransition()
  const [busy, setBusy] = useState<"save" | "test" | null>(null)
  const [feedback, setFeedback] = useState<{ ok: boolean; message: string } | null>(null)
  const dirty = baseUrl !== saved.baseUrl || model !== saved.model || Boolean(apiKey) || removeKey || (saved.keySource === "environment" && saved.encryptionReady)

  function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy("save")
    setFeedback(null)
    startTransition(async () => {
      try {
        const result = await saveLlmSettingsAction({ baseUrl, model, apiKey, removeKey })
        if (!result.ok) { setFeedback(result); return }
        setSaved(result.overview)
        setBaseUrl(result.overview.baseUrl)
        setModel(result.overview.model)
        setApiKey("")
        setRemoveKey(false)
        setFeedback({ ok: true, message: "Model settings saved. Changes apply to the next analysis." })
        toast.success("Model settings saved")
      } catch {
        setFeedback({ ok: false, message: "Could not save. Check your connection and try again." })
      } finally { setBusy(null) }
    })
  }

  function testConnection() {
    setBusy("test")
    setFeedback(null)
    startTransition(async () => {
      try {
        const result = await testLlmAction()
        setFeedback({ ok: result.ok, message: result.message ?? "Connection checked." })
      } catch {
        setFeedback({ ok: false, message: "Could not test the connection. Try again." })
      } finally { setBusy(null) }
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Language model</CardTitle>
        <CardDescription>Optional. A model reviews uncertain matches and tailors CVs and cover letters using your verified facts. Drafts stay editable and require your review.</CardDescription>
        <CardAction><Badge variant={saved.configured ? "default" : "secondary"}>{saved.configured ? "Configured" : "Off"}</Badge></CardAction>
      </CardHeader>
      <CardContent>
        <form onSubmit={save}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="llm-endpoint">API base URL</FieldLabel>
              <Input id="llm-endpoint" type="url" required value={baseUrl} onChange={(event) => { setBaseUrl(event.target.value); setFeedback(null) }} disabled={pending} placeholder="https://api.deepseek.com/v1" autoCapitalize="none" spellCheck={false} />
              <FieldDescription>Any OpenAI-compatible API, including local models such as Ollama.</FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="llm-model">Model</FieldLabel>
              <Input id="llm-model" required maxLength={160} value={model} onChange={(event) => { setModel(event.target.value); setFeedback(null) }} disabled={pending} placeholder="deepseek-chat" autoCapitalize="none" spellCheck={false} />
            </Field>
            <Field>
              <FieldLabel htmlFor="llm-api-key">API key</FieldLabel>
              <Input id="llm-api-key" type="password" autoComplete="new-password" autoCapitalize="none" spellCheck={false} maxLength={4096} value={apiKey} onChange={(event) => { setApiKey(event.target.value); setRemoveKey(false); setFeedback(null) }} disabled={pending || !saved.encryptionReady} placeholder={saved.hasKey && !removeKey ? "Key saved — leave blank to keep it" : "Enter your API key"} aria-describedby="llm-key-help" />
              <FieldDescription id="llm-key-help">
                {removeKey ? "The key will be removed when you save." : saved.keySource === "environment" ? "An environment key is active. Saving moves it into encrypted database storage." : saved.hasKey ? "A key is saved securely. Enter a new key to replace it; leave blank to keep it." : "Stored encrypted in the database. The saved key is never sent back to this page."}
              </FieldDescription>
              {saved.hasKey && !apiKey ? <Button type="button" variant="outline" size="sm" className="w-fit" disabled={pending} onClick={() => { setRemoveKey(!removeKey); setFeedback(null) }}>{removeKey ? "Keep existing key" : "Remove existing key"}</Button> : null}
              {!saved.encryptionReady ? <FieldDescription role="status">API key storage needs a server encryption key. Set SETTINGS_ENCRYPTION_KEY in the environment to a random 64-character hex value, then restart the app.</FieldDescription> : null}
            </Field>
            <div className="flex flex-wrap gap-2">
              <Button type="submit" disabled={pending || !dirty}>{busy === "save" ? <Loader2Icon className="animate-spin" /> : null} Save model settings</Button>
              <Button type="button" variant="outline" disabled={pending || dirty || !saved.configured} onClick={testConnection}>{busy === "test" ? <Loader2Icon className="animate-spin" /> : <PlugZapIcon />} Test connection</Button>
            </div>
            {dirty ? <FieldDescription>Save your changes before testing the connection.</FieldDescription> : null}
            {feedback ? <p role={feedback.ok ? "status" : "alert"} className={feedback.ok ? "text-sm text-muted-foreground" : "text-sm text-destructive"}>{feedback.message}</p> : null}
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  )
}
