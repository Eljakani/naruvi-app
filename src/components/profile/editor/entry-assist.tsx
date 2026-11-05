"use client"

import { useState, useTransition } from "react"
import { LanguagesIcon, SparklesIcon } from "lucide-react"
import { toast } from "sonner"
import { describeEntryAction, translateEntryAction } from "@/app/(app)/profile/actions"
import { AI_STEPS, AiSteps, useStep } from "@/components/ai-progress"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import { type Draft, type Lang, LANGS, newKey } from "./draft"

const NAME: Record<Lang, string> = { en: "English", fr: "French" }

/**
 * AI help inside the entry editor: turn your own words into facts and fields,
 * and fill the missing language. Only fills empty fields and appends facts;
 * nothing is saved until you press Save.
 */
export function EntryAssist({ draft, patch }: { draft: Draft; patch: (value: Partial<Draft>) => void }) {
  const [words, setWords] = useState("")
  const [describing, startDescribing] = useTransition()
  const [translating, startTranslating] = useTransition()
  const describeStep = useStep(describing, AI_STEPS.describe.length)
  const translateStep = useStep(translating, AI_STEPS.translate.length)

  const filled = (lang: Lang) => Boolean(draft.display[lang].role || draft.display[lang].organization) || draft.bullets.some((bullet) => bullet.language === lang && bullet.text.trim())
  const from = LANGS.find(filled)
  const to = from ? LANGS.find((lang) => lang !== from && (!draft.display[lang].role || draft.bullets.filter((b) => b.language === lang).length < draft.bullets.filter((b) => b.language === from).length)) : undefined

  const describe = () =>
    startDescribing(async () => {
      const result = await describeEntryAction({ words, kind: draft.kind, existingFacts: draft.facts.map((fact) => fact.statement) })
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

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <SparklesIcon className="size-4" /> Fill it with AI
        </CardTitle>
        <CardDescription>Describe it in your own words, the way you’d tell a friend. AI fills the role, dates and skills and turns it into facts. It only uses what you write.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        <Textarea value={words} onChange={(event) => setWords(event.target.value)} placeholder="e.g. From 2021 to 2024 I ran the night shift at a 40-bed hospital ward in Lyon, trained 6 new nurses and set up the medication double-check that cut errors in half…" className="min-h-24" disabled={describing} />
        <div className="flex flex-wrap items-center justify-between gap-3">
          {describing ? <AiSteps steps={AI_STEPS.describe} step={describeStep} /> : translating ? <AiSteps steps={AI_STEPS.translate} step={translateStep} /> : <span />}
          <div className="flex gap-2">
            {from && to ? (
              <Button variant="outline" onClick={translate} disabled={translating || describing}>
                <LanguagesIcon /> Add {NAME[to]} version
              </Button>
            ) : null}
            <Button onClick={describe} disabled={describing || words.trim().length < 20}>
              <SparklesIcon className={describing ? "cb-breathe" : undefined} /> Fill from this
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
