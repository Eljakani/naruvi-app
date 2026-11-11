"use client"

import Image from "next/image"
import { useState } from "react"
import { ArrowUpRightIcon, CheckIcon, Loader2Icon, PlugIcon, PlugZapIcon } from "lucide-react"
import { listLlmModelsAction, saveLlmSettingsAction, testLlmAction } from "@/app/[locale]/(app)/settings/actions"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectSeparator, SelectTrigger, SelectValue } from "@/components/ui/select"
import { AI_PROVIDERS, BEDROCK_REGIONS, bedrockEndpoint, bedrockRegionForEndpoint, providerForEndpoint } from "@/lib/ai-providers"
import type { LlmOverview } from "@/server/settings/llm"
import { useTranslations } from "next-intl"

const groups = ["Cloud", "Gateways", "Local"] as const
const logos = {
  openai: "openai", anthropic: "claude-color", gemini: "gemini-color",
  deepseek: "deepseek-color", mistral: "mistral-color", xai: "xai", groq: "groq",
  together: "together-color", fireworks: "fireworks-color", cerebras: "cerebras-color",
  deepinfra: "deepinfra-color", openrouter: "openrouter-color", vercel: "vercel",
  bedrock: "bedrock-color", huggingface: "huggingface-color", nvidia: "nvidia-color",
  perplexity: "perplexity-color", cohere: "cohere-color", qwen: "qwen-color", moonshot: "moonshot", zhipu: "zhipu-color", minimax: "minimax-color",
  ollama: "ollama", lmstudio: "lmstudio", vllm: "vllm-color",
} satisfies Record<(typeof AI_PROVIDERS)[number]["id"], string>

const providerOptions = [
  ...AI_PROVIDERS.map(({ id, name }) => ({ value: id, label: name })),
  { value: "custom", label: "Custom endpoint" },
] // the custom label is replaced at render

function ProviderLogo({ id }: { id?: keyof typeof logos }) {
  if (!id) return <PlugIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
  const logo = logos[id]
  return <Image alt="" src={`/provider-logos/${logo}.svg`} width={16} height={16} className={`size-4 shrink-0 object-contain ${logo.endsWith("-color") ? "" : "dark:invert"}`} />
}

const normalize = (url: string) => url.trim().replace(/\/+$/, "")
const localEndpoint = (url: string) => {
  try { return ["localhost", "127.0.0.1", "[::1]", "ollama"].includes(new URL(url).hostname) }
  catch { return false }
}

export function ModelSettings({ initial }: { initial: LlmOverview }) {
  const t = useTranslations("modelSettings")
  const [saved, setSaved] = useState(initial)
  const [providerId, setProviderId] = useState(providerForEndpoint(initial.baseUrl)?.id ?? "custom")
  const [baseUrl, setBaseUrl] = useState(initial.baseUrl)
  const [model, setModel] = useState(initial.model)
  const [apiKey, setApiKey] = useState("")
  const [removeKey, setRemoveKey] = useState(false)
  const [models, setModels] = useState<{ id: string; label: string }[]>([])
  const [modelFilter, setModelFilter] = useState("")
  const [busy, setBusy] = useState<"save" | "test" | "list" | null>(null)
  const [feedback, setFeedback] = useState<{ ok: boolean; message: string } | null>(null)

  const provider = AI_PROVIDERS.find((item) => item.id === providerId)
  const bedrockRegion = bedrockRegionForEndpoint(baseUrl)
  const activeProvider = providerForEndpoint(saved.baseUrl)
  const query = modelFilter.trim().toLowerCase()
  const visibleModels = models.filter((item) => item.id === model || item.label.toLowerCase().includes(query) || item.id.toLowerCase().includes(query))
  const sameEndpoint = normalize(baseUrl) === saved.baseUrl
  const local = localEndpoint(baseUrl)
  const keepsKey = sameEndpoint && saved.hasKey && !removeKey
  const hasAccess = Boolean(apiKey.trim()) || (keepsKey && saved.configured)
  const discardOldKey = !sameEndpoint && saved.hasKey && local && !apiKey.trim()
  const canSave = Boolean(baseUrl.trim() && model.trim()) && (hasAccess || local || removeKey)
  const dirty = !sameEndpoint || model.trim() !== saved.model || Boolean(apiKey.trim()) || removeKey || (saved.keySource === "environment" && saved.encryptionReady)
  const testNeedsSave = !providerForEndpoint(baseUrl) && !sameEndpoint
  const input = { baseUrl, model, apiKey, removeKey: removeKey || discardOldKey }

  function chooseProvider(id: string) {
    const next = AI_PROVIDERS.find((item) => item.id === id)
    const isSavedProvider = (providerForEndpoint(saved.baseUrl)?.id ?? "custom") === id
    setProviderId(id)
    setBaseUrl(isSavedProvider ? saved.baseUrl : next?.baseUrl ?? "")
    setModel(isSavedProvider ? saved.model : "")
    setApiKey("")
    setRemoveKey(false)
    setModels([])
    setFeedback(null)
  }

  function changeEndpoint(endpoint: string) {
    setBaseUrl(endpoint)
    setModel(normalize(endpoint) === saved.baseUrl ? saved.model : "")
    setApiKey("")
    setRemoveKey(false)
    setModels([])
    setFeedback(null)
  }

  async function run(action: NonNullable<typeof busy>) {
    if (busy) return
    setBusy(action)
    setFeedback(null)
    try {
      if (action === "save") {
        const result = await saveLlmSettingsAction(input)
        if (!result.ok) { setFeedback(result); return }
        setSaved(result.overview)
        setBaseUrl(result.overview.baseUrl)
        setModel(result.overview.model)
        setApiKey("")
        setRemoveKey(false)
        setFeedback({ ok: true, message: t("saved") })
      } else if (action === "test") {
        const result = await testLlmAction(input)
        setFeedback({ ok: result.ok, message: result.message ?? t("checked") })
      } else {
        const result = await listLlmModelsAction(input)
        if (!result.ok) { setFeedback(result); return }
        setModels(result.models)
        setModelFilter("")
        setFeedback({ ok: true, message: t("loaded", { count: result.models.length }) })
      }
    } catch {
      setFeedback({ ok: false, message: t("requestFailed") })
    } finally { setBusy(null) }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle><h3>{t("title")}</h3></CardTitle>
        <CardDescription>{t("description")}</CardDescription>
        <CardAction><Badge variant={saved.configured ? "default" : "secondary"}>{saved.configured ? t("configured") : t("off")}</Badge></CardAction>
      </CardHeader>
      <CardContent>
        <form onSubmit={(event) => { event.preventDefault(); if (canSave && dirty) void run("save") }}>
          {saved.configured && (
            <div className="mb-4 flex items-start gap-2 rounded-md bg-muted/50 px-3 py-2 text-sm">
              <span className="mt-0.5"><ProviderLogo id={activeProvider?.id} /></span>
              <p className="min-w-0">
                <span className="font-medium">{t("active", { name: activeProvider?.name ?? t("custom") })}</span>
                <span className="ms-2 break-all text-muted-foreground">{saved.model}</span>
              </p>
            </div>
          )}
          <fieldset disabled={Boolean(busy)} className="min-w-0">
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="llm-provider">{t("provider")}</FieldLabel>
                <Select items={providerOptions.map((option) => (option.value === "custom" ? { ...option, label: t("custom") } : option))} value={providerId} disabled={Boolean(busy)} onValueChange={(id) => { if (id) chooseProvider(id) }}>
                  <SelectTrigger id="llm-provider" className="h-9 w-full min-w-0">
                    <SelectValue>
                      <ProviderLogo id={provider?.id} />
                      {provider?.name ?? t("custom")}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent alignItemWithTrigger={false} className="max-h-80">
                    {groups.map((group) => (
                      <SelectGroup key={group}>
                        <SelectLabel>{t(`groups.${group}`)}</SelectLabel>
                        {AI_PROVIDERS.filter((item) => item.group === group).map((item) => (
                          <SelectItem key={item.id} value={item.id} label={item.name} className="min-h-9">
                            <ProviderLogo id={item.id} />
                            {item.name}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    ))}
                    <SelectSeparator />
                    <SelectGroup>
                      <SelectItem value="custom" label={t("custom")} className="min-h-9"><ProviderLogo /> {t("custom")}</SelectItem>
                    </SelectGroup>
                  </SelectContent>
                </Select>
                <FieldDescription>
                  {provider?.group === "Local" ? t("hint.local") : provider?.group === "Gateways" ? t("hint.gateway") : provider ? t("hint.cloud") : t("hint.custom")}
                </FieldDescription>
                {provider ? <a className="inline-flex w-fit items-center gap-1 text-sm font-medium underline underline-offset-4" href={provider.help} target="_blank" rel="noreferrer">{provider.group === "Local" ? t("setupGuide", { name: provider.name }) : provider.id === "bedrock" ? t("bedrockKey") : t("getKey", { name: provider.name })} <ArrowUpRightIcon className="size-3.5" aria-hidden /></a> : null}
              </Field>
              {provider?.id === "bedrock" && bedrockRegion && (
                <Field>
                  <FieldLabel htmlFor="bedrock-region">{t("region")}</FieldLabel>
                  <Select
                    items={BEDROCK_REGIONS.map(({ id, label }) => ({ value: id, label }))}
                    value={bedrockRegion.id}
                    disabled={Boolean(busy)}
                    onValueChange={(id) => { if (id) changeEndpoint(bedrockEndpoint(id)) }}
                  >
                    <SelectTrigger id="bedrock-region" className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent alignItemWithTrigger={false} className="max-h-80">
                      {BEDROCK_REGIONS.map(({ id, label }) => <SelectItem key={id} value={id} label={label}>{label} ({id})</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <FieldDescription>{t("regionHint")}</FieldDescription>
                </Field>
              )}
              {!provider ? <Field>
                <FieldLabel htmlFor="llm-endpoint">{t("baseUrl")}</FieldLabel>
                <Input id="llm-endpoint" type="url" required value={baseUrl} onChange={(event) => { setBaseUrl(event.target.value); setApiKey(""); setRemoveKey(false); setModels([]); setFeedback(null) }} placeholder="https://your-server.example/v1" autoCapitalize="none" spellCheck={false} />
                <FieldDescription>{t("baseUrlHint")}</FieldDescription>
              </Field> : null}
              <Field>
                <FieldLabel htmlFor="llm-api-key">{local ? t("keyOptional") : t("key")}</FieldLabel>
                <Input id="llm-api-key" type="password" autoComplete="new-password" autoCapitalize="none" spellCheck={false} maxLength={4096} value={apiKey} onChange={(event) => { setApiKey(event.target.value); setRemoveKey(false); setModels([]); setFeedback(null) }} disabled={!saved.encryptionReady} placeholder={keepsKey ? t("keepKey") : local ? t("notNeeded") : provider?.id === "bedrock" ? t("pasteBedrock") : t("pasteKey")} aria-describedby="llm-key-help" />
                <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                  <FieldDescription id="llm-key-help">
                    {removeKey || discardOldKey ? t("keyRemoved") : !sameEndpoint && saved.hasKey ? t("keyOther") : keepsKey && saved.keySource === "environment" ? t("keyEnv") : t("keyEncrypted")}
                  </FieldDescription>
                  {sameEndpoint && saved.hasKey && !apiKey ? (
                    <Button type="button" variant="ghost" size="sm" className="-ms-2 shrink-0" onClick={() => { setRemoveKey(!removeKey); setModels([]); setFeedback(null) }}>
                      {removeKey ? t("keepCurrent") : t("removeCurrent")}
                    </Button>
                  ) : null}
                </div>
                {!saved.encryptionReady && !local ? <FieldDescription role="status">{t("noEncryption")}</FieldDescription> : null}
              </Field>
              <Field>
                <FieldLabel htmlFor="llm-model">{t("modelId")}</FieldLabel>
                <div className="flex flex-wrap items-center gap-2">
                  <Input className="min-w-0 basis-40 grow" id="llm-model" required maxLength={160} value={model} onChange={(event) => { setModel(event.target.value); setFeedback(null) }} placeholder={t("modelPlaceholder")} autoCapitalize="none" spellCheck={false} />
                  {provider ? <Button type="button" variant="outline" disabled={!hasAccess && !local} onClick={() => void run("list")}>{busy === "list" ? <Loader2Icon className="animate-spin motion-reduce:animate-none" /> : null} {t("loadModels")}</Button> : null}
                </div>
                {models.length > 12 ? <Input type="search" aria-label={t("filter")} placeholder={t("filter")} value={modelFilter} onChange={(event) => setModelFilter(event.target.value)} /> : null}
                {models.length ? <select aria-label={t("available")} className="h-9 w-full min-w-0 rounded-md border bg-background px-3 text-sm focus-visible:outline-2 focus-visible:outline-ring" value={models.some((item) => item.id === model) ? model : ""} onChange={(event) => { setModel(event.target.value); setFeedback(null) }}>
                  <option value="" disabled>{visibleModels.length ? t("select") : t("noMatch")}</option>
                  {visibleModels.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
                </select> : null}
                <FieldDescription>{provider ? t("modelHint") : t("modelHintCustom")}</FieldDescription>
              </Field>
              <div className="flex flex-wrap gap-2 border-t pt-4">
                <Button type="submit" disabled={!dirty || !canSave}>{busy === "save" ? <Loader2Icon className="animate-spin motion-reduce:animate-none" /> : null} {t("save")}</Button>
                <Button type="button" variant="outline" disabled={!model.trim() || (!hasAccess && !local) || testNeedsSave} onClick={() => void run("test")}>{busy === "test" ? <Loader2Icon className="animate-spin motion-reduce:animate-none" /> : <PlugZapIcon />} {t("test")}</Button>
              </div>
              {testNeedsSave && baseUrl ? <FieldDescription>{t("saveFirst")}</FieldDescription> : null}
              {feedback ? <p role={feedback.ok ? "status" : "alert"} className={feedback.ok ? "flex items-start gap-2 text-sm text-muted-foreground" : "text-sm text-destructive"}>{feedback.ok ? <CheckIcon className="mt-0.5 size-4 shrink-0" aria-hidden /> : null}{feedback.message}</p> : null}
            </FieldGroup>
          </fieldset>
        </form>
      </CardContent>
    </Card>
  )
}
