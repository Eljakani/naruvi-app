"use client"

import { NaruviAvatar, Otter } from "@/components/naruvi/otter"
import { useEffect, useRef, useState, useSyncExternalStore, useTransition } from "react"
import { createPortal } from "react-dom"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { ArrowDownIcon, ArrowLeftIcon, ArrowRightIcon, CheckIcon, LanguagesIcon, MinusIcon, SparklesIcon, XIcon } from "lucide-react"
import { useAutoResizeTextarea } from "@/hooks/use-auto-resize-textarea"
import { Kbd } from "@/components/ui/kbd"
import { toast } from "sonner"
import { describeEntryAction, translateEntryAction } from "@/app/[locale]/(app)/profile/actions"
import { AI_STEPS, AiSteps, useAiStepText, useStep } from "@/components/ai-progress"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { DictateButton } from "@/components/dictation"
import { cn } from "@/lib/utils"
import { type Draft, type Lang, LANGS, newKey } from "./draft"
import { useLocale, useTranslations } from "next-intl"
import { languageName } from "@/i18n/config"


/** One question at a time, the way a good recruiter or career coach would ask. Answers in any language. */
const QUESTIONS = { experience: 5, education: 4, project: 4, certification: 3, achievement: 3 } as const
const questionsFor = (kind: string, t: ReturnType<typeof useTranslations<"entryAssist">>) => {
  const key = (kind in QUESTIONS ? kind : "experience") as keyof typeof QUESTIONS
  return Array.from({ length: QUESTIONS[key] }, (_, index) => t(`questions.${key}.${index}` as never) as string)
}

/**
 * AI help inside the entry editor: turn your own words into facts and fields,
 * and fill the missing language. Only fills empty fields and appends facts;
 * nothing is saved until you press Save.
 */
export function EntryAssist({ draft, patch }: { draft: Draft; patch: (value: Partial<Draft>) => void }) {
  const t = useTranslations("entryAssist")
  const locale = useLocale()
  const stepText = useAiStepText()
  const [words, setWords] = useState("")
  const [mode, setMode] = useState<"free" | "guided">("free")
  const [step, setStep] = useState(0)
  const [answers, setAnswers] = useState<string[]>([])
  // New or empty entries start open; filled ones keep the editor uncluttered.
  const [open, setOpen] = useState(() => draft.facts.length === 0)
  const [describing, startDescribing] = useTransition()
  const [translating, startTranslating] = useTransition()
  const describeStep = useStep(describing, AI_STEPS.describe.length)
  const reduced = useReducedMotion()
  const mounted = useSyncExternalStore(() => () => {}, () => true, () => false)
  // What the last fill added, shown in the panel until you write again.
  const [result, setResult] = useState<{ facts: number; skills: number; dropped: number } | null>(null)
  const { textareaRef: freeRef, adjustHeight } = useAutoResizeTextarea({ minHeight: 112, maxHeight: 280 })
  const panel = useRef<HTMLDivElement>(null)
  useEffect(() => { adjustHeight(!words) }, [words, adjustHeight])
  // Escape minimises; the words stay.
  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape" && !describing) setOpen(false) }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open, describing])
  const translateStep = useStep(translating, AI_STEPS.translate.length)

  const filled = (lang: Lang) => Boolean(draft.display[lang].role || draft.display[lang].organization) || draft.bullets.some((bullet) => bullet.language === lang && bullet.text.trim())
  const from = LANGS.find(filled)
  const to = from ? LANGS.find((lang) => lang !== from && (!draft.display[lang].role || draft.bullets.filter((b) => b.language === lang).length < draft.bullets.filter((b) => b.language === from).length)) : undefined

  const questions = questionsFor(draft.kind, t)
  const guidedText = () => questions.flatMap((question, index) => (answers[index]?.trim() ? [`${question}\n${answers[index].trim()}`] : [])).join("\n\n")
  const describe = (text = words) =>
    startDescribing(async () => {
      const result = await describeEntryAction({ words: text, kind: draft.kind, existingFacts: draft.facts.map((fact) => fact.statement) })
      if (!result.ok) return void toast.error(result.message)
      const { entry, language } = result.data
      const lang: Lang = (LANGS as string[]).includes(language) ? (language as Lang) : "en"
      const current = draft.display[lang]
      const isNew = !draft.facts.length && !draft.title.trim()
      patch({
        kind: isNew ? entry.kind : draft.kind,
        title: draft.title.trim() || entry.title,
        display: { ...draft.display, [lang]: { role: current.role || entry.display.role, organization: current.organization || entry.display.organization, dates: current.dates || entry.display.dates, location: current.location || entry.display.location } },
        facts: [...draft.facts.filter((fact) => fact.statement.trim()), ...entry.facts.map((statement) => ({ key: newKey(), statement }))],
        skills: [...new Set([...draft.skills, ...entry.skills])],
      })
      setWords("")
      setAnswers([])
      setStep(0)
      setResult({ facts: entry.facts.length, skills: entry.skills.length, dropped: entry.dropped ?? 0 })
      // The panel shows what was added (no duplicate toast).
    })

  const translate = () =>
    startTranslating(async () => {
      if (!from || !to) return
      const counts = new Map<string, number>()
      for (const bullet of draft.bullets) if (bullet.language === to) counts.set(bullet.group, (counts.get(bullet.group) ?? 0) + 1)
      const missing = draft.bullets.filter((bullet) => {
        if (bullet.language !== from || !bullet.text.trim()) return false
        const left = counts.get(bullet.group) ?? 0
        if (left > 0) { counts.set(bullet.group, left - 1); return false }
        return true
      })
      const result = await translateEntryAction({ from, to, display: draft.display[from], bullets: missing.map((bullet) => ({ id: bullet.key, text: bullet.text })) })
      if (!result.ok) return void toast.error(result.message)
      const target = draft.display[to]
      const translatedDisplay = result.data.display
      const byId = new Map(result.data.bullets.map((bullet) => [bullet.id, bullet.text]))
      patch({
        display: { ...draft.display, [to]: { role: target.role || translatedDisplay.role, organization: target.organization || translatedDisplay.organization, dates: target.dates || translatedDisplay.dates, location: target.location || translatedDisplay.location } },
        bullets: [...draft.bullets, ...missing.filter((bullet) => byId.has(bullet.key)).map((bullet) => ({ ...bullet, key: newKey(), language: to, text: byId.get(bullet.key)! }))],
      })
      toast.success(t("translated", { language: languageName(to, locale) }), { description: t("translatedBody", { count: result.data.bullets.length }) })
    })

  const text = mode === "guided" ? guidedText() : words
  const ready = !describing && text.trim().length >= 20
  const submit = () => { if (ready) describe(text) }
  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) { event.preventDefault(); submit() }
  }
  const answered = answers.filter((answer) => answer?.trim()).length

  return (
    <>
      {/* Inline entry point: always where you'd look for it, and it says what's waiting in the panel. */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border px-4 py-3">
        <NaruviAvatar size={26} />
        <span className="min-w-0 flex-1 text-sm text-muted-foreground">
          {words.trim() || answered ? t("waiting") : t("invite")}
        </span>
        {from && to ? (
          <Button size="sm" variant="ghost" onClick={translate} disabled={translating}>
            <LanguagesIcon className={translating ? "cb-breathe" : undefined} /> {translating ? stepText(AI_STEPS.translate[translateStep]) : t("addVersion", { language: languageName(to, locale) })}
          </Button>
        ) : null}
        <Button size="sm" variant={open ? "secondary" : "outline"} onClick={() => setOpen(!open)} aria-expanded={open} aria-controls="entry-assist-panel">
          <SparklesIcon className="text-brand" /> {open ? t("hide") : t("tell")}
        </Button>
      </div>

      {/* Floating composer: stays in view while the fields fill in behind it. A bottom sheet on phones.
          Portalled to <body>: a transformed ancestor (page entrance animation) would otherwise pin "fixed" to the page. */}
      {mounted ? createPortal(<AnimatePresence>
        {open ? (
          <motion.div
            ref={panel}
            id="entry-assist-panel"
            role="dialog"
            aria-label={t("dialogLabel")}
            initial={reduced ? { opacity: 0 } : { opacity: 0, y: 24, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduced ? { opacity: 0 } : { opacity: 0, y: 16, scale: 0.98, transition: { duration: 0.15 } }}
            transition={{ type: "spring", duration: 0.4, bounce: 0.12 }}
            className="fixed inset-x-2 bottom-2 z-40 flex max-h-[min(36rem,calc(100dvh-1rem))] origin-bottom-right rtl:origin-bottom-left flex-col overflow-hidden rounded-2xl border bg-background shadow-2xl shadow-foreground/10 ring-1 ring-foreground/5 sm:inset-x-auto sm:end-[calc(var(--assistant-dock,0px)+1.5rem)] sm:bottom-6 sm:w-[26rem] sm:transition-[inset-inline-end] sm:duration-300 sm:ease-[var(--ease-drawer)]"
          >
            <div className="flex items-center gap-2.5 border-b px-4 py-3">
              <NaruviAvatar size={30} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">{t("title")}</p>
                <p className="truncate text-xs text-muted-foreground">{describing ? t("reading") : t("subtitle")}</p>
              </div>
              <Button size="icon-sm" variant="ghost" aria-label={t("minimise")} title={t("minimiseEsc")} disabled={describing} onClick={() => setOpen(false)}><MinusIcon /></Button>
              <Button size="icon-sm" variant="ghost" aria-label={t("close")} title={t("close")} disabled={describing} onClick={() => { setOpen(false); setWords(""); setAnswers([]); setStep(0); setResult(null) }}><XIcon /></Button>
            </div>

            <div className="grid min-h-0 gap-3 overflow-y-auto p-4" onKeyDown={onKeyDown}>
              {/* Mode switch: a pill that glides between the two ways of telling it. */}
              <div className="grid grid-cols-2 rounded-lg bg-muted p-0.5 text-xs font-medium" role="tablist" aria-label={t("how")}>
                {(["free", "guided"] as const).map((value) => (
                  <button key={value} type="button" role="tab" aria-selected={mode === value} disabled={describing} onClick={() => setMode(value)}
                    className={cn("relative h-7 rounded-md transition-colors focus-visible:outline-2 focus-visible:outline-ring", mode === value ? "text-foreground" : "text-muted-foreground hover:text-foreground")}>
                    {mode === value ? <motion.span layoutId="entry-assist-mode" transition={{ type: "spring", duration: 0.3, bounce: 0.15 }} className="absolute inset-0 rounded-md bg-background shadow-xs ring-1 ring-foreground/5" /> : null}
                    <span className="relative">{value === "free" ? t("free") : `${t("guided")}${answered ? ` · ${answered}/${questions.length}` : ""}`}</span>
                  </button>
                ))}
              </div>

              {result && !describing && !text.trim() ? (
                <div className="cb-step flex items-center gap-3 rounded-xl border border-emerald-500/25 bg-emerald-500/5 p-3">
                  <Otter pose="all-checked" height={56} className="-my-1 shrink-0" />
                  <div className="grid min-w-0 flex-1 gap-1">
                    <p className="text-sm font-medium">{result.skills ? t("addedBoth", { facts: result.facts, skills: result.skills }) : t("added", { facts: result.facts })}</p>
                    <p className="text-xs text-pretty text-muted-foreground">{result.dropped ? `${t("dropped", { count: result.dropped })} ` : ""}{t("notSaved")}</p>
                    <Button size="xs" variant="outline" className="w-fit" onClick={() => document.getElementById("facts")?.scrollIntoView({ behavior: "smooth", block: "start" })}><ArrowDownIcon /> {t("reviewFacts")}</Button>
                  </div>
                </div>
              ) : null}

              <AnimatePresence mode="wait" initial={false}>
                {mode === "free" ? (
                  <motion.div key="free" initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -8 }} transition={{ duration: 0.15 }} className="grid gap-2">
                    <Textarea
                      ref={freeRef}
                      autoFocus
                      value={words}
                      onChange={(event) => { setWords(event.target.value); setResult(null) }}
                      placeholder={t("freePlaceholder")}
                      className="min-h-28 resize-none text-base sm:text-sm"
                      disabled={describing}
                      maxLength={4000}
                    />
                    <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
                      <DictateButton value={words} onChange={(value) => { setWords(value); setResult(null) }} />
                      <span className={cn("ms-auto text-xs tabular-nums", words.trim().length && words.trim().length < 20 ? "text-amber-600" : "text-muted-foreground")}>
                        {words.trim().length && words.trim().length < 20 ? t("more") : words.length ? `${words.length.toLocaleString(locale)} / ${(4000).toLocaleString(locale)}` : t("helps")}
                      </span>
                    </div>
                  </motion.div>
                ) : (
                  <motion.div key="guided" initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 8 }} transition={{ duration: 0.15 }} className="grid gap-2">
                    <span className="flex gap-1" aria-hidden>
                      {questions.map((question, index) => (
                        <button key={question} type="button" tabIndex={-1} onClick={() => setStep(index)} className={cn("h-1 flex-1 rounded-full transition-colors", answers[index]?.trim() ? "bg-brand" : index === step ? "bg-foreground/30" : "bg-muted")} />
                      ))}
                    </span>
                    <div className="flex items-start justify-between gap-2">
                      <p key={step} className="cb-step text-sm font-medium text-pretty">{questions[step]}</p>
                      <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{step + 1}/{questions.length}</span>
                    </div>
                    <Textarea
                      key={`answer-${step}`}
                      autoFocus
                      value={answers[step] ?? ""}
                      onChange={(event) => { setAnswers((current) => Object.assign([...current], { [step]: event.target.value })); setResult(null) }}
                      onKeyDown={(event) => {
                        // Enter moves on; Shift+Enter is a new line; ⌘/Ctrl+Enter fills.
                        if (event.key === "Enter" && !event.shiftKey && !event.metaKey && !event.ctrlKey && !event.nativeEvent.isComposing && step < questions.length - 1) { event.preventDefault(); setStep(step + 1) }
                      }}
                      placeholder={t("answerPlaceholder")}
                      className="min-h-20 resize-none text-base sm:text-sm"
                      disabled={describing}
                    />
                    <div className="flex items-center justify-between gap-2">
                      <DictateButton value={answers[step] ?? ""} onChange={(value) => setAnswers((current) => Object.assign([...current], { [step]: value }))} />
                      <div className="flex gap-1">
                        <Button size="icon-sm" variant="ghost" aria-label={t("previous")} disabled={step === 0 || describing} onClick={() => setStep(step - 1)}><ArrowLeftIcon /></Button>
                        <Button size="sm" variant="outline" disabled={describing || step === questions.length - 1} onClick={() => setStep(step + 1)}>{answers[step]?.trim() ? t("next") : t("skip")} <ArrowRightIcon /></Button>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {describing ? <div className="cb-step rounded-lg bg-muted/40 px-3 py-2"><AiSteps steps={AI_STEPS.describe} step={describeStep} /></div> : null}
            </div>

            <div className="flex items-center gap-2 border-t bg-muted/20 px-4 py-3">
              <span className="hidden text-xs text-muted-foreground sm:inline-flex sm:items-center sm:gap-1"><Kbd>⌘</Kbd><Kbd>↵</Kbd> {t("toFill")}</span>
              <Button className="ms-auto bg-brand text-brand-foreground hover:bg-brand/90" onClick={submit} disabled={!ready}>
                {describing ? <SparklesIcon className="cb-breathe" /> : result && !text.trim() ? <CheckIcon /> : <SparklesIcon />}
                {describing ? t("filling") : t("fill")}
              </Button>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>, document.body) : null}
    </>
  )
}
