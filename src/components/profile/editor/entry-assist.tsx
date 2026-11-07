"use client"

import { NaruviAvatar } from "@/components/naruvi/otter"
import { useState, useTransition } from "react"
import { LanguagesIcon, SparklesIcon } from "lucide-react"
import { toast } from "sonner"
import { describeEntryAction, translateEntryAction } from "@/app/(app)/profile/actions"
import { AI_STEPS, AiSteps, useStep } from "@/components/ai-progress"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { DictateButton } from "@/components/dictation"
import { cn } from "@/lib/utils"
import { type Draft, type Lang, LANGS, newKey } from "./draft"

const NAME: Record<Lang, string> = { en: "English", fr: "French" }

/** One question at a time, the way a good recruiter or career coach would ask. Answers in any language. */
const QUESTIONS: Record<string, string[]> = {
  experience: ["What was your role, and at which company or organisation?", "When did it start and end, and where was it?", "What did you do day to day?", "What are you proudest of there? Numbers help: how many, how much, how fast, for whom.", "Which tools, methods or skills did you use?"],
  education: ["What did you study, and at which school?", "When, and where?", "Which subjects, projects or thesis are worth mentioning?", "Any results, honours or responsibilities (student association, tutoring…)?"],
  project: ["What is the project, and who was it for?", "What was your part in it?", "What came out of it? Users, results, numbers, links.", "Which tools or methods did you use?"],
  certification: ["Which certification, and who issued it?", "When did you get it, and does it expire?", "What did you have to know or do to get it?"],
  achievement: ["What did you achieve or win?", "When, and in what context?", "Why does it matter? Numbers or who recognised it."],
}
const questionsFor = (kind: string) => QUESTIONS[kind] ?? QUESTIONS.experience

/**
 * AI help inside the entry editor: turn your own words into facts and fields,
 * and fill the missing language. Only fills empty fields and appends facts;
 * nothing is saved until you press Save.
 */
export function EntryAssist({ draft, patch }: { draft: Draft; patch: (value: Partial<Draft>) => void }) {
  const [words, setWords] = useState("")
  const [mode, setMode] = useState<"free" | "guided">("free")
  const [step, setStep] = useState(0)
  const [answers, setAnswers] = useState<string[]>([])
  // New or empty entries start open; filled ones keep the editor uncluttered.
  const [open, setOpen] = useState(() => draft.facts.length === 0)
  const [describing, startDescribing] = useTransition()
  const [translating, startTranslating] = useTransition()
  const describeStep = useStep(describing, AI_STEPS.describe.length)
  const translateStep = useStep(translating, AI_STEPS.translate.length)

  const filled = (lang: Lang) => Boolean(draft.display[lang].role || draft.display[lang].organization) || draft.bullets.some((bullet) => bullet.language === lang && bullet.text.trim())
  const from = LANGS.find(filled)
  const to = from ? LANGS.find((lang) => lang !== from && (!draft.display[lang].role || draft.bullets.filter((b) => b.language === lang).length < draft.bullets.filter((b) => b.language === from).length)) : undefined

  const questions = questionsFor(draft.kind)
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
      toast.success(`Added ${entry.facts.length} fact${entry.facts.length === 1 ? "" : "s"}${entry.skills.length ? ` and ${entry.skills.length} skills` : ""}`, { description: entry.dropped ? `${entry.dropped} left out: their numbers weren’t in what you wrote.` : "Check them below, then suggest bullets." })
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
      const t = result.data.display
      const byId = new Map(result.data.bullets.map((bullet) => [bullet.id, bullet.text]))
      patch({
        display: { ...draft.display, [to]: { role: target.role || t.role, organization: target.organization || t.organization, dates: target.dates || t.dates, location: target.location || t.location } },
        bullets: [...draft.bullets, ...missing.filter((bullet) => byId.has(bullet.key)).map((bullet) => ({ ...bullet, key: newKey(), language: to, text: byId.get(bullet.key)! }))],
      })
      toast.success(`${NAME[to]} version added`, { description: `${result.data.bullets.length} bullet${result.data.bullets.length === 1 ? "" : "s"} translated with the same facts linked.` })
    })

  if (!open) {
    return (
      <div className="flex flex-wrap items-center gap-2 rounded-xl border px-4 py-3">
        <NaruviAvatar size={26} />
        <span className="flex-1 text-sm text-muted-foreground">Tell me more about it in your own words, or let me translate it.</span>
        {from && to ? (
          <Button size="sm" variant="ghost" onClick={translate} disabled={translating}>
            <LanguagesIcon className={translating ? "cb-breathe" : undefined} /> {translating ? AI_STEPS.translate[translateStep] : `Add ${NAME[to]} version`}
          </Button>
        ) : null}
        <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
          <SparklesIcon className="text-brand" /> Tell Naruvi
        </Button>
      </div>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2.5">
          <NaruviAvatar size={28} /> Tell me about it
        </CardTitle>
        <CardDescription>Describe it the way you’d tell a friend. I’ll fill in the role, dates and skills and turn it into facts, using only what you write.</CardDescription>
        {draft.facts.length ? (
          <CardAction>
            <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
              Close
            </Button>
          </CardAction>
        ) : null}
      </CardHeader>
      <CardContent className="grid gap-3">
        <ToggleGroup aria-label="How to describe it" variant="outline" size="sm" value={[mode]} onValueChange={(value) => value[0] && setMode(value[0] as "free" | "guided")} className="w-fit">
          <ToggleGroupItem value="free">Tell it freely</ToggleGroupItem>
          <ToggleGroupItem value="guided">Answer questions</ToggleGroupItem>
        </ToggleGroup>
        {mode === "free" ? (
          <>
            <Textarea value={words} onChange={(event) => setWords(event.target.value)} placeholder="e.g. From 2021 to 2024 I ran the night shift at a 40-bed hospital ward in Lyon, trained 6 new nurses and set up the medication double-check that cut errors in half…" className="min-h-24" disabled={describing} />
            <DictateButton value={words} onChange={setWords} />
          </>
        ) : (
          <div key={step} className="cb-step grid gap-2 rounded-lg border bg-muted/20 p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-medium">{questions[step]}</p>
              <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{step + 1} / {questions.length}</span>
            </div>
            <Textarea
              autoFocus
              value={answers[step] ?? ""}
              onChange={(event) => setAnswers((current) => Object.assign([...current], { [step]: event.target.value }))}
              placeholder="Type or dictate your answer. Skip what doesn’t apply."
              className="min-h-20 bg-background"
              disabled={describing}
            />
            <div className="flex flex-wrap items-center justify-between gap-2">
              <DictateButton value={answers[step] ?? ""} onChange={(value) => setAnswers((current) => Object.assign([...current], { [step]: value }))} />
              <div className="flex gap-1">
                <Button size="sm" variant="ghost" disabled={step === 0 || describing} onClick={() => setStep(step - 1)}>Back</Button>
                {step < questions.length - 1 ? (
                  <Button size="sm" variant="outline" disabled={describing} onClick={() => setStep(step + 1)}>{answers[step]?.trim() ? "Next" : "Skip"}</Button>
                ) : null}
              </div>
            </div>
            <span className="flex gap-1" aria-hidden>
              {questions.map((question, index) => (
                <span key={question} className={cn("h-1 flex-1 rounded-full transition-colors", answers[index]?.trim() ? "bg-primary" : index === step ? "bg-foreground/30" : "bg-muted")} />
              ))}
            </span>
          </div>
        )}
        <div className="flex flex-wrap items-center justify-between gap-3">
          {describing ? <AiSteps steps={AI_STEPS.describe} step={describeStep} /> : translating ? <AiSteps steps={AI_STEPS.translate} step={translateStep} /> : <span />}
          <div className="flex gap-2">
            {from && to ? (
              <Button variant="outline" onClick={translate} disabled={translating || describing}>
                <LanguagesIcon /> Add {NAME[to]} version
              </Button>
            ) : null}
            <Button onClick={() => describe(mode === "guided" ? guidedText() : words)} disabled={describing || (mode === "guided" ? guidedText().length < 20 : words.trim().length < 20)}>
              <SparklesIcon className={describing ? "cb-breathe" : undefined} /> Fill from this
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
