"use client"

import Link from "next/link"
import { useState, useTransition } from "react"
import { ArrowUpRightIcon, CheckIcon, CircleAlertIcon, CircleCheckIcon, Loader2Icon, PlugZapIcon, ScanSearchIcon } from "lucide-react"
import { AnimatePresence, motion, MotionConfig } from "motion/react"
import { useTranslations } from "next-intl"
import { connectDecisionModelAction, dismissDecisionTipAction } from "@/app/[locale]/(app)/setup/actions"
import { Alert, AlertAction, AlertDescription, AlertTitle } from "@/components/reui/alert"
import { Badge } from "@/components/reui/badge"
import { Frame, FrameDescription, FrameFooter, FrameHeader, FramePanel, FrameTitle } from "@/components/reui/frame"
import { IconTile } from "@/components/reui/icon-tile"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Segmented } from "@/components/ui/segmented"
import { decisionProviders } from "@/lib/decision-providers"

type Source = "openrouter" | "typesafe"
const PRICE_URL = "https://openrouter.ai/~typesafe/jev-latest"
const EASE = [0.22, 1, 0.36, 1] as const
/** Height and opacity together, so what appears pushes the rest down instead of jumping. */
const unfold = { initial: { height: 0, opacity: 0 }, animate: { height: "auto", opacity: 1 }, exit: { height: 0, opacity: 0 }, transition: { duration: 0.24, ease: EASE } }

/**
 * An optional suggestion in the setup guide: what a decision model changes,
 * where a key comes from, and one field to check and save it in place.
 */
export function DecisionRecommendation({ canStoreKeys, llmOnOpenRouter }: { canStoreKeys: boolean; llmOnOpenRouter: boolean }) {
  const t = useTranslations("setupDecision")
  const [source, setSource] = useState<Source>("openrouter")
  const [apiKey, setApiKey] = useState("")
  const [connected, setConnected] = useState(false)
  const [hidden, setHidden] = useState(false)
  const [error, setError] = useState("")
  const [busy, setBusy] = useState<"connect" | "reuse" | null>(null)
  const [, startTransition] = useTransition()

  function connect(useLlmKey: boolean) {
    if (busy) return
    setBusy(useLlmKey ? "reuse" : "connect")
    setError("")
    startTransition(async () => {
      try {
        const result = await connectDecisionModelAction({ provider: source, model: "jev-latest", apiKey: useLlmKey ? "" : apiKey, useLlmKey })
        if (result.ok) {
          setApiKey("")
          setConnected(true)
        } else {
          setError(result.reason === "other" ? result.message || t("failed.other") : t(`failed.${result.reason}`))
        }
      } catch {
        setError(t("failed.other"))
      } finally {
        setBusy(null)
      }
    })
  }

  return (
    <MotionConfig reducedMotion="user">
      {/* "Not now" folds the card away at once; the choice is saved when the fold has finished. */}
      <AnimatePresence initial={false} onExitComplete={() => startTransition(async () => { await dismissDecisionTipAction() })}>
        {hidden ? null : (
          <motion.section key="card" aria-labelledby="setup-decision-title" className="overflow-hidden" exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.28, ease: EASE }}>
            <Frame>
              <FrameHeader className="flex-row items-start gap-3">
                <IconTile variant="soft" size="sm" className={connected ? "text-success" : undefined}>
                  {connected ? <CheckIcon aria-hidden /> : <ScanSearchIcon aria-hidden />}
                </IconTile>
                <div className="grid min-w-0 flex-1 gap-1">
                  <FrameTitle className="flex flex-wrap items-center gap-2">
                    <h2 id="setup-decision-title">{t("title")}</h2>
                    <Badge variant={connected ? "success-light" : "outline"} size="sm">{connected ? t("connected") : t("optional")}</Badge>
                  </FrameTitle>
                  <FrameDescription className="text-pretty">{t("intro")}</FrameDescription>
                </div>
              </FrameHeader>

              <FramePanel className="grid gap-4">
                <ul className="grid gap-x-4 gap-y-2 text-sm sm:grid-cols-2">
                  {(["requirements", "matching", "enrichment", "claims"] as const).map((key) => (
                    <li key={key} className="flex items-start gap-2">
                      <CheckIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
                      <span><span className="font-medium">{t(`gains.${key}.title`)}</span> <span className="text-muted-foreground">{t(`gains.${key}.text`)}</span></span>
                    </li>
                  ))}
                </ul>

                <AnimatePresence initial={false} mode="wait">
                  {connected ? (
                    <motion.div key="connected" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.24, ease: EASE }}>
                      <Alert variant="success" role="status">
                        <CircleCheckIcon aria-hidden />
                        <AlertTitle>{t("connected")}</AlertTitle>
                        <AlertDescription>{t("success")}</AlertDescription>
                      </Alert>
                    </motion.div>
                  ) : (
                    <motion.form key="form" className="grid gap-3" exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.16, ease: EASE }} onSubmit={(event) => { event.preventDefault(); if (apiKey.trim()) connect(false) }}>
                      <Segmented<Source>
                        label={t("source")}
                        className="w-fit max-w-full"
                        value={source}
                        onChange={(value) => { setSource(value); setError("") }}
                        options={[{ value: "openrouter", label: t("sources.openrouter") }, { value: "typesafe", label: t("sources.typesafe") }]}
                      />
                      <AnimatePresence initial={false} mode="wait">
                        <motion.div key={source} className="grid gap-1 text-sm text-muted-foreground" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.14 }}>
                          <p>{source === "openrouter" ? t("how.openrouter") : t("how.typesafe")}</p>
                          <p>
                            {source === "openrouter" ? t("cost.openrouter") : t("cost.typesafe")}{" "}
                            {source === "openrouter" ? (
                              <a href={PRICE_URL} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium text-foreground underline underline-offset-4">
                                {t("price")} <ArrowUpRightIcon className="size-3.5" aria-hidden />
                              </a>
                            ) : null}
                          </p>
                        </motion.div>
                      </AnimatePresence>

                      <AnimatePresence initial={false}>
                        {source === "openrouter" && llmOnOpenRouter ? (
                          <motion.div key="reuse" className="overflow-hidden" {...unfold}>
                            <Alert role="note">
                              <PlugZapIcon aria-hidden />
                              <AlertTitle className="line-clamp-none font-normal">{t("reuseHint")}</AlertTitle>
                              <AlertAction>
                                <Button type="button" size="sm" disabled={Boolean(busy)} onClick={() => connect(true)}>
                                  {busy === "reuse" ? <Loader2Icon className="animate-spin motion-reduce:animate-none" /> : null} {t("reuse")}
                                </Button>
                              </AlertAction>
                            </Alert>
                          </motion.div>
                        ) : null}
                      </AnimatePresence>

                      <div className="grid gap-1.5">
                        <label htmlFor="setup-decision-key" className="text-sm font-medium">{t("key")}</label>
                        <div className="flex flex-wrap items-center gap-2">
                          <Input
                            id="setup-decision-key"
                            className="min-w-0 basis-56 grow"
                            type="password"
                            autoComplete="new-password"
                            autoCapitalize="none"
                            spellCheck={false}
                            maxLength={4096}
                            value={apiKey}
                            disabled={!canStoreKeys || Boolean(busy)}
                            aria-invalid={error ? true : undefined}
                            onChange={(event) => { setApiKey(event.target.value); setError("") }}
                            placeholder={t("keyPlaceholder")}
                            aria-describedby="setup-decision-help"
                          />
                          <Button type="submit" disabled={!canStoreKeys || !apiKey.trim() || Boolean(busy)}>
                            {busy === "connect" ? <Loader2Icon className="animate-spin motion-reduce:animate-none" /> : <PlugZapIcon />} {t("connect")}
                          </Button>
                        </div>
                        <p id="setup-decision-help" className="text-xs text-muted-foreground">{canStoreKeys ? t("keyHint") : t("failed.encryption")}</p>
                        <a href={decisionProviders[source].keyUrl} target="_blank" rel="noreferrer" className="inline-flex w-fit items-center gap-1 text-sm font-medium underline underline-offset-4">
                          {source === "openrouter" ? t("getKey.openrouter") : t("getKey.typesafe")} <ArrowUpRightIcon className="size-3.5" aria-hidden />
                        </a>
                      </div>

                      <AnimatePresence initial={false}>
                        {error ? (
                          <motion.div key="error" className="overflow-hidden" {...unfold}>
                            <Alert variant="destructive">
                              <CircleAlertIcon aria-hidden />
                              <AlertTitle className="line-clamp-none font-normal">{error}</AlertTitle>
                            </Alert>
                          </motion.div>
                        ) : null}
                      </AnimatePresence>
                    </motion.form>
                  )}
                </AnimatePresence>
              </FramePanel>

              {connected ? null : (
                <FrameFooter className="flex-row flex-wrap items-center gap-x-3 gap-y-1">
                  <Button type="button" variant="ghost" size="sm" className="-ms-2" disabled={Boolean(busy)} onClick={() => setHidden(true)}>{t("notNow")}</Button>
                  <span className="text-xs text-muted-foreground">
                    {t.rich("later", { link: (chunks) => <Link href="/integrations#decision-model" className="underline underline-offset-4">{chunks}</Link> })}
                  </span>
                </FrameFooter>
              )}
            </Frame>
          </motion.section>
        )}
      </AnimatePresence>
    </MotionConfig>
  )
}
