"use client"

import Image from "next/image"
import { useState, useTransition } from "react"
import { ArrowUpRightIcon, ListChecksIcon, Loader2Icon, PlugZapIcon } from "lucide-react"
import { toast } from "sonner"
import { saveDecisionSettingsAction, testDecisionModelAction } from "@/app/[locale]/(app)/settings/actions"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { decisionProviders, type DecisionProvider } from "@/lib/decision-providers"
import type { DecisionOverview } from "@/server/settings/decisions"
import { useTranslations } from "next-intl"

const providerLogos = {
  typesafe: "typesafe.png",
  cloudflare: "cloudflare-color.svg",
  openai: "openai.svg",
} satisfies Record<DecisionProvider, string>

function DecisionProviderLogo({ provider }: { provider: DecisionProvider }) {
  return (
    <Image
      alt=""
      src={`/provider-logos/${providerLogos[provider]}`}
      width={16}
      height={16}
      unoptimized
      className={`size-4 shrink-0 object-contain ${provider === "openai" ? "dark:invert" : ""}`}
    />
  )
}

export function DecisionSettings({ initial }: { initial: DecisionOverview }) {
  const t = useTranslations("decisionSettings")
  const [saved, setSaved] = useState(initial)
  const [provider, setProvider] = useState(initial.provider)
  const [accountId, setAccountId] = useState(initial.accountId)
  const [model, setModel] = useState(initial.model)
  const [apiKey, setApiKey] = useState("")
  const [pending, startTransition] = useTransition()
  const [busy, setBusy] = useState<"save" | "test" | "remove" | null>(null)

  const providerChanged = provider !== saved.provider
  const dirty = providerChanged || model !== saved.model || accountId !== saved.accountId || Boolean(apiKey)
  const selected = decisionProviders[provider]

  const changeProvider = (next: DecisionProvider | null) => {
    if (!next || next === provider) return
    setProvider(next)
    setModel(next === saved.provider ? saved.model : decisionProviders[next].models[0])
    setAccountId(next === saved.provider ? saved.accountId : "")
    setApiKey("")
  }

  const save = (removeKey = false) => {
    if (pending) return
    setBusy(removeKey ? "remove" : "save")
    startTransition(async () => {
      try {
        const result = await saveDecisionSettingsAction({ provider, model, accountId, apiKey, removeKey })
        if (!result.ok) return void toast.error(result.message)
        setSaved(result.overview)
        setModel(result.overview.model)
        setAccountId(result.overview.accountId)
        setApiKey("")
        toast.success(removeKey ? t("keyRemoved") : t("saved"))
      } catch {
        toast.error(t("saveFailed"))
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
        if (result.ok) toast.success(result.message ?? t("connected"))
        else toast.error(result.message ?? t("testFailed"))
      } catch {
        toast.error(t("testError"))
      } finally {
        setBusy(null)
      }
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h3 className="flex items-center gap-2">
            <ListChecksIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            {t("title")}
          </h3>
        </CardTitle>
        <CardDescription>
          {t("description")}
        </CardDescription>
        <CardAction>
          <Badge variant={saved.configured ? "default" : "secondary"}>{saved.configured ? t("connected") : t("off")}</Badge>
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
              <FieldLabel htmlFor="decision-provider">{t("provider")}</FieldLabel>
              <Select<DecisionProvider> value={provider} onValueChange={changeProvider} disabled={pending}>
                <SelectTrigger id="decision-provider" className="w-full min-w-0">
                  <SelectValue><DecisionProviderLogo provider={provider} /> {selected.label}</SelectValue>
                </SelectTrigger>
                <SelectContent alignItemWithTrigger={false}>
                  {(Object.keys(decisionProviders) as DecisionProvider[]).map((id) => (
                    <SelectItem key={id} value={id} label={decisionProviders[id].label}>
                      <DecisionProviderLogo provider={id} /> {decisionProviders[id].label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel htmlFor="decision-model-id">{t("model")}</FieldLabel>
              {provider === "typesafe" ? (
                <>
                  <Input id="decision-model-id" value={model} onChange={(event) => setModel(event.target.value)} disabled={pending} autoCapitalize="none" spellCheck={false} />
                  <FieldDescription>{t("modelHint")}</FieldDescription>
                </>
              ) : (
                <Select value={model} onValueChange={(value) => value && setModel(value)} disabled={pending}>
                  <SelectTrigger id="decision-model-id"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {selected.models.map((id) => <SelectItem key={id} value={id}>{id}</SelectItem>)}
                  </SelectContent>
                </Select>
              )}
            </Field>
            {provider === "cloudflare" && (
              <Field>
                <FieldLabel htmlFor="decision-account">{t("accountId")}</FieldLabel>
                <Input id="decision-account" value={accountId} onChange={(event) => setAccountId(event.target.value)} disabled={pending} required autoCapitalize="none" spellCheck={false} />
                <FieldDescription>{t("cloudflareHint")}</FieldDescription>
              </Field>
            )}
            <Field>
              <FieldLabel htmlFor="decision-key">{t("key")}</FieldLabel>
              <Input id="decision-key" type="password" autoComplete="new-password" disabled={pending} value={apiKey} onChange={(event) => setApiKey(event.target.value)} required={providerChanged} placeholder={!providerChanged && saved.hasKey ? t("keepKey") : t("pasteKey")} />
              <FieldDescription>{t("keyHint")}</FieldDescription>
              <a href={selected.keyUrl} target="_blank" rel="noreferrer" className="inline-flex w-fit items-center gap-1 text-sm font-medium underline underline-offset-4">
                {t("getKey")} <ArrowUpRightIcon className="size-3.5" aria-hidden />
              </a>
            </Field>
            <div className="flex flex-wrap gap-2 border-t pt-4">
              <Button type="submit" disabled={pending || !dirty || (providerChanged && !apiKey.trim())}>
                {busy === "save" ? <Loader2Icon className="animate-spin motion-reduce:animate-none" /> : null} {t("save")}
              </Button>
              <Button type="button" variant="outline" disabled={pending || dirty || !saved.configured} onClick={test}>
                {busy === "test" ? <Loader2Icon className="animate-spin motion-reduce:animate-none" /> : <PlugZapIcon />} {t("test")}
              </Button>
              {saved.keySource === "database" ? (
                <Button type="button" variant="ghost" disabled={pending || dirty} onClick={() => save(true)}>
                  {busy === "remove" ? <Loader2Icon className="animate-spin motion-reduce:animate-none" /> : null} {t("removeKey")}
                </Button>
              ) : null}
            </div>
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  )
}
