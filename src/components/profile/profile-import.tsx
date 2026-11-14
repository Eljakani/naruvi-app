"use client"

import { entryView, KIND_FIELDS, type EntryFields, type EntryKind } from "@/lib/entry-fields"
import type { EnrichmentSuggestion, EntryEnrichment } from "@/lib/enrichment"
import { EnrichmentFacts } from "@/components/profile/enrichment-facts"
import { EntryLogo } from "@/components/profile/entry-logo"
import { Checkbox } from "@/components/ui/checkbox"
import { Otter } from "@/components/naruvi/otter"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useRef, useState, useTransition } from "react"
import { ArrowLeftIcon, CheckIcon, FileUpIcon, GlobeIcon, SparklesIcon, TriangleAlertIcon } from "lucide-react"
import { toast } from "sonner"
import { enrichImportAction, readCvAction, saveImportAction } from "@/app/[locale]/(app)/profile/actions"
import { AI_STEPS, AiSteps, useStep } from "@/components/ai-progress"
import { KIND_SINGULAR, type Kind } from "@/components/profile/labels"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { useTranslations } from "next-intl"

type Result = Extract<Awaited<ReturnType<typeof readCvAction>>, { ok: true }>["data"]
type Entry = Result["entries"][number]
type Decision = "new" | "merge" | "skip"
/** What the person keeps of an entry's online suggestion. The official name is off until they ask for it: their wording stays. */
type Choice = { about: boolean; name: boolean; fill: boolean; groups: boolean; skills: Record<string, boolean> }
const defaultChoice = (suggestion: EnrichmentSuggestion | null): Choice => ({ about: true, name: false, fill: true, groups: false, skills: Object.fromEntries((suggestion?.skills ?? []).map((item) => [item.from, true])) })

type Shaped = { kind: Entry["kind"]; text: Record<string, string>; fields: EntryFields; facts: string[]; skills: string[]; bullets: Entry["bullets"]; enrichment?: EntryEnrichment | null; logoPath?: string | null }

/**
 * The entry as it will be saved, with what the person kept of its online
 * suggestion: the public facts and logo, an empty field filled, a skill
 * spelled the usual way, or an unsorted skill list split into groups.
 */
function withSuggestion(entry: Entry, suggestion: EnrichmentSuggestion | null, choice: Choice | undefined, groupName: (category: string) => string): Shaped[] {
  const base: Shaped = { kind: entry.kind, text: { ...entry.text }, fields: { ...entry.fields }, facts: entry.facts, skills: entry.skills, bullets: entry.bullets }
  if (!suggestion || !choice) return [base]
  const specs = KIND_FIELDS[entry.kind as EntryKind]
  const put = (field: string, value: string) => {
    if (specs.find((spec) => spec.key === field)?.translated) base.text[field] = value
    else base.fields[field] = value
  }
  const filled: Record<string, string> = {}
  if (choice.fill) for (const item of suggestion.fill) {
    put(item.field, item.value)
    filled[item.field] = item.value
  }
  if (choice.name && suggestion.officialName) put(suggestion.officialName.field, suggestion.officialName.value)
  const renames = suggestion.skills.filter((item) => choice.skills[item.from])
  const renamed = (skill: string) => renames.find((item) => item.from === skill)?.to ?? skill
  base.skills = entry.skills.map(renamed)
  if (suggestion.about && choice.about) {
    base.enrichment = { ...suggestion.about, filled }
    base.logoPath = suggestion.logoPath
  } else if (renames.length) {
    base.enrichment = { subject: "skills", query: Object.values(entry.text)[0] ?? "", name: Object.values(entry.text)[0] ?? "", description: null, website: null, facts: [], sources: [...new Map(renames.map((item) => [item.source, { name: new URL(item.source).hostname.replace(/^(www|en)\./, ""), url: item.source }])).values()].slice(0, 4), filled: {}, skills: renames.map(({ from, to, source }) => ({ from, to, source })), fetchedAt: new Date().toISOString() }
  }
  if (choice.groups && suggestion.groups.length > 1) return suggestion.groups.map((group) => ({ ...base, text: { name: groupName(group.category) }, skills: group.skills.map(renamed), enrichment: null }))
  return [base]
}

/** Default: update what you already have, add what's new, skip what adds nothing. */
const initialDecision = (entry: Entry): Decision => (!entry.match ? "new" : entry.match.newFacts.length || entry.match.newSkills.length ? "merge" : "skip")

/** Upload or paste a CV → review what was found → add the chosen entries as "needs review". */
export function ProfileImport() {
  const t = useTranslations("profileImport")
  const tk = useTranslations("profileLabels.kindSingular")
  const router = useRouter()
  const [text, setText] = useState("")
  const [file, setFile] = useState<File | null>(null)
  const [result, setResult] = useState<Result | null>(null)
  const [decisions, setDecisions] = useState<Decision[]>([])
  const te = useTranslations("enrichment")
  const tf = useTranslations("entryEditor.kindFields") as unknown as (key: string) => string
  /** Online suggestions per entry: null until asked for. */
  const [lookup, setLookup] = useState<{ suggestions: (EnrichmentSuggestion | null)[]; failed: number; enabled: boolean } | null>(null)
  const [choices, setChoices] = useState<Choice[]>([])
  const [looking, startLooking] = useTransition()
  const [reading, startReading] = useTransition()
  const [saving, startSaving] = useTransition()
  const [dragging, setDragging] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const step = useStep(reading, AI_STEPS.cvImport.length)

  const read = () =>
    startReading(async () => {
      const form = new FormData()
      if (file) form.set("file", file)
      form.set("text", text)
      const response = await readCvAction(form)
      if (!response.ok) return void toast.error(response.message)
      setResult(response.data)
      setDecisions(response.data.entries.map(initialDecision))
      setLookup(null)
      setChoices([])
    })

  const lookUp = () =>
    startLooking(async () => {
      if (!result) return
      const response = await enrichImportAction(result.entries.map((entry) => ({ kind: entry.kind, text: entry.text, fields: entry.fields, skills: entry.skills })))
      if (!response.ok) return void toast.error(response.message)
      setLookup(response.data)
      setChoices(response.data.suggestions.map(defaultChoice))
    })
  const choose = (index: number, patch: Partial<Choice>) => setChoices((current) => current.map((item, i) => (i === index ? { ...item, ...patch } : item)))

  const save = () =>
    startSaving(async () => {
      if (!result) return
      const response = await saveImportAction({
        language: result.language,
        reader: result.reader,
        identity: result.identity,
        entries: result.entries.flatMap((entry, index) => (decisions[index] === "new" ? withSuggestion(entry, lookup?.suggestions[index] ?? null, choices[index], (category) => te(`categories.${category}` as never) as string) : [])),
        merges: result.entries.flatMap((entry, index) => (decisions[index] === "merge" && entry.match ? [{ entryId: entry.match.entryId, facts: entry.match.newFacts, skills: entry.match.newSkills, text: entry.text, fields: entry.fields }] : [])),
      })
      if (!response.ok) return void toast.error(response.message)
      const { created, merged, factsAdded, reverify, failed } = response.data
      if (failed) toast.warning(t("toast.failed", { count: failed }))
      toast.success([created ? t("toast.created", { count: created }) : "", merged ? t("toast.merged", { count: merged, facts: factsAdded }) : ""].filter(Boolean).join(" · ") || t("toast.nothing"), { description: reverify ? t("toast.reverify", { count: reverify }) : t("toast.review") })
      router.push("/profile")
    })

  const decide = (index: number, value: Decision) => setDecisions((current) => current.map((item, i) => (i === index ? value : item)))
  const count = (value: Decision) => decisions.filter((item) => item === value).length

  if (!result) {
    return (
      <div className="mx-auto grid w-full max-w-2xl gap-4">
        <Button variant="ghost" size="sm" className="w-fit" nativeButton={false} render={<Link href="/profile" />}>
          <ArrowLeftIcon /> {t("back")}
        </Button>
        <Card>
          <CardHeader>
            <div className="flex items-end gap-4">
              <Otter pose="reading-stack" height={92} className="-mb-1 shrink-0" priority />
              <div className="grid gap-1.5">
                <CardTitle>{t("title")}</CardTitle>
                <CardDescription className="max-w-[30rem]">{t("description")}</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="grid gap-4">
            <button
              type="button"
              onClick={() => input.current?.click()}
              onDragOver={(event) => { event.preventDefault(); setDragging(true) }}
              onDragLeave={() => setDragging(false)}
              onDrop={(event) => { event.preventDefault(); setDragging(false); const dropped = event.dataTransfer.files[0]; if (dropped) setFile(dropped) }}
              className={cn("flex flex-col items-center gap-2 rounded-xl border border-dashed p-8 text-center transition-colors", dragging ? "border-ring bg-muted" : "hover:bg-muted/50")}
            >
              <FileUpIcon className="size-6 text-muted-foreground" />
              <span className="text-sm font-medium">{file ? file.name : t("drop")}</span>
              <span className="text-xs text-muted-foreground">{t("formats")}</span>
            </button>
            <input ref={input} type="file" accept=".pdf,.docx,.odt,.txt,.md,.html,.zip,.csv,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.oasis.opendocument.text,text/plain,text/html,application/zip,text/csv" className="hidden" onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span className="h-px flex-1 bg-border" /> {t("orPaste")} <span className="h-px flex-1 bg-border" />
            </div>
            <Textarea value={text} onChange={(event) => setText(event.target.value)} placeholder={t("pastePlaceholder")} className="min-h-40" />
          </CardContent>
          <CardFooter className="justify-between gap-4 border-t">
            {reading ? <AiSteps steps={AI_STEPS.cvImport} step={step} /> : <span className="text-xs text-muted-foreground">{t("timing")}</span>}
            <Button onClick={read} disabled={reading || (!file && text.trim().length < 80)}>
              <SparklesIcon className={reading ? "cb-breathe" : "text-brand"} /> {t("read")}
            </Button>
          </CardFooter>
        </Card>
      </div>
    )
  }

  const id = result.identity
  return (
    <div className="mx-auto grid w-full max-w-3xl gap-4">
      <Button variant="ghost" size="sm" className="w-fit" onClick={() => setResult(null)}>
        <ArrowLeftIcon /> {t("startOver")}
      </Button>
      <div>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("found")}</h1>
          <p className="text-sm text-muted-foreground">
            {t("summary", { created: count("new"), merged: count("merge"), skipped: count("skip") })}
          </p>
        </div>
      </div>

      {result.reader === "rules" || result.notes.length || result.failedParts.length ? (
        <div className="grid gap-1 rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 text-sm">
          {result.reader === "rules" ? <p className="flex gap-2"><TriangleAlertIcon className="mt-0.5 size-4 shrink-0 text-amber-600" /> {t("rulesReader")}</p> : null}
          {result.notes.map((note) => (
            <p key={note.code} className="text-muted-foreground">{note.code === "pagesWithoutText" ? t("notePagesWithoutText", { count: note.count }) : t("notePagesNotRead", { count: note.count })}</p>
          ))}
          {result.failedParts.length ? <p className="text-muted-foreground">{t("failedParts", { count: result.failedParts.length })} {result.failedParts.map((part) => `“${part}”`).join(" · ")}</p> : null}
        </div>
      ) : null}

      {id.fullName || id.email || id.headline ? (
        <Card size="sm">
          <CardHeader>
            <CardTitle>{id.fullName || t("you")}</CardTitle>
            <CardDescription>{[id.headline, id.location, id.email, id.phone, id.links.length ? t("linksLabel", { count: id.links.length }) : ""].filter(Boolean).join(" · ")}</CardDescription>
            <CardAction>
              <Badge variant="outline">{t("fillsEmpty")}</Badge>
            </CardAction>
          </CardHeader>
          {id.summary || id.links.length ? (
            <CardContent className="grid gap-1 text-sm text-muted-foreground">
              {id.summary ? <p><span className="font-medium text-foreground">{t("summaryLabel")}: </span>{id.summary}</p> : null}
              {id.links.length ? <p className="truncate text-xs">{id.links.map((link) => `${link.label}: ${link.url}`).join(" · ")}</p> : null}
            </CardContent>
          ) : null}
        </Card>
      ) : null}

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border p-3">
        <Button variant="outline" size="sm" onClick={lookUp} disabled={looking}>
          <GlobeIcon className={looking ? "cb-breathe" : undefined} /> {looking ? te("loading") : te("button")}
        </Button>
        <p className="min-w-0 flex-1 text-xs text-muted-foreground">
          {!lookup ? te("hint") : !lookup.enabled ? te("disabled") : [lookup.suggestions.some(Boolean) ? te("found", { count: lookup.suggestions.filter(Boolean).length }) : te("none"), lookup.failed ? te("failed", { count: lookup.failed }) : ""].filter(Boolean).join(" ")}
        </p>
      </div>

      <div className="cb-stagger grid gap-3">
        {result.entries.map((entry, index) => {
          const decision = decisions[index]
          const match = entry.match
          const facts = decision === "merge" && match ? match.newFacts : entry.facts
          const skills = decision === "merge" && match ? match.newSkills : entry.skills
          const view = entryView({ kind: entry.kind, display: { [result.language]: entry.text }, fields: entry.fields }, result.language)
          const suggestion = decision === "new" ? lookup?.suggestions[index] ?? null : null
          const choice = choices[index]
          return (
            <Card key={index} size="sm" className={cn("transition-opacity", decision === "skip" && "opacity-50")}>
              <CardHeader>
                <CardTitle className="truncate">{view.heading || "—"}</CardTitle>
                <CardDescription className="truncate">
                  {entry.kind in KIND_SINGULAR ? tk(entry.kind as Kind) : entry.kind}
                  {[view.subheading, view.dates, view.location].filter(Boolean).map((part) => ` · ${part}`)}
                </CardDescription>
                <CardAction>
                  <ToggleGroup value={[decision]} onValueChange={(value) => value[0] && decide(index, value[0] as Decision)} variant="outline" size="sm" aria-label={t("whatToDo", { title: view.heading })}>
                    {match ? <ToggleGroupItem value="merge">{t("update")}</ToggleGroupItem> : null}
                    <ToggleGroupItem value="new">{match ? t("addNew") : t("add")}</ToggleGroupItem>
                    <ToggleGroupItem value="skip">{t("skip")}</ToggleGroupItem>
                  </ToggleGroup>
                </CardAction>
              </CardHeader>
              {decision !== "skip" || match ? (
                <CardContent className="grid gap-2">
                  {match ? (
                    <p className="text-xs text-muted-foreground">
                      {t.rich("matches", { title: match.name, b: (chunks) => <span className="font-medium text-foreground">{chunks}</span> })}
                      {match.knownFacts ? ` · ${t("known", { count: match.knownFacts })}` : ""}
                      {decision === "merge" && !facts.length && !skills.length ? ` · ${t("nothingNew")}` : ""}
                      {decision === "merge" && facts.length && match.status === "verified" ? ` · ${t("recheck")}` : ""}
                    </p>
                  ) : null}
                  {decision !== "skip" && facts.length ? (
                    <ul className="grid list-disc gap-1 ps-4 text-sm text-muted-foreground">
                      {facts.slice(0, 6).map((fact) => (
                        <li key={fact}>{decision === "merge" ? <span className="text-foreground">+ </span> : null}{fact}</li>
                      ))}
                      {facts.length > 6 ? <li className="list-none text-xs">{t("more", { count: facts.length - 6 })}</li> : null}
                    </ul>
                  ) : null}
                  {decision !== "skip" && skills.length ? (
                    <div className="flex flex-wrap gap-1">
                      {skills.slice(0, 14).map((skill) => (
                        <Badge key={skill} variant="outline">
                          {skill}
                        </Badge>
                      ))}
                    </div>
                  ) : null}
                  {suggestion && choice ? (
                    <div className="grid gap-2 rounded-lg border border-dashed p-3 text-sm">
                      <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground"><GlobeIcon className="size-3.5" /> {te("title")}</p>
                      {suggestion.about ? (
                        <>
                          <div className="flex gap-3">
                            {suggestion.logoPath ? <EntryLogo path={suggestion.logoPath} name={suggestion.about.name} size={36} /> : null}
                            <EnrichmentFacts about={suggestion.about} />
                          </div>
                          <label className="flex items-center gap-2"><Checkbox checked={choice.about} onCheckedChange={(checked) => choose(index, { about: checked === true })} /> {te("keep")}</label>
                        </>
                      ) : null}
                      {suggestion.officialName ? <label className="flex items-center gap-2"><Checkbox checked={choice.name} onCheckedChange={(checked) => choose(index, { name: checked === true })} /> {te("knownAs", { name: suggestion.officialName.value })}</label> : null}
                      {suggestion.fill.length ? <label className="flex items-center gap-2"><Checkbox checked={choice.fill} onCheckedChange={(checked) => choose(index, { fill: checked === true })} /> {suggestion.fill.map((item) => te("fill", { field: tf(`${entry.kind}.${item.field}.label`), value: item.value })).join(" · ")}</label> : null}
                      {suggestion.skills.length ? (
                        <div className="grid gap-1">
                          <p className="text-xs text-muted-foreground">{te("rename")}</p>
                          <div className="flex flex-wrap gap-x-4 gap-y-1">
                            {suggestion.skills.map((item) => (
                              <label key={item.from} className="flex items-center gap-1.5">
                                <Checkbox checked={choice.skills[item.from] ?? false} onCheckedChange={(checked) => choose(index, { skills: { ...choice.skills, [item.from]: checked === true } })} />
                                <span>{item.from} → <a href={item.source} target="_blank" rel="noreferrer" className="underline underline-offset-2">{item.to}</a></span>
                              </label>
                            ))}
                          </div>
                        </div>
                      ) : null}
                      {suggestion.groups.length > 1 ? (
                        <label className="flex items-start gap-2">
                          <Checkbox className="mt-0.5" checked={choice.groups} onCheckedChange={(checked) => choose(index, { groups: checked === true })} />
                          <span>{te("groups")}<span className="block text-xs text-muted-foreground">{suggestion.groups.map((group) => `${te(`categories.${group.category}`)}: ${group.skills.join(", ")}`).join(" · ")}</span></span>
                        </label>
                      ) : null}
                    </div>
                  ) : null}
                  {"unnamed" in entry && entry.unnamed && decision === "new" ? <p className="text-xs text-amber-700 dark:text-amber-400">{t("unnamed")}</p> : null}
                  {entry.dropped ? <p className="text-xs text-muted-foreground">{t("dropped", { count: entry.dropped })}</p> : null}
                </CardContent>
              ) : null}
            </Card>
          )
        })}
      </div>

      {result.unread.length ? (
        <details className="rounded-lg border p-3 text-sm">
          <summary className="cursor-pointer font-medium">{t("unreadTitle", { count: result.unread.length })}</summary>
          <p className="mt-1 text-xs text-muted-foreground">{t("unreadHint")}</p>
          <ul className="mt-2 grid list-disc gap-1 ps-4 text-muted-foreground">
            {result.unread.map((line) => <li key={line}>{line}</li>)}
          </ul>
        </details>
      ) : null}

      <div className="sticky bottom-0 -mx-2 grid gap-2 border-t bg-background/90 px-2 py-4 backdrop-blur sm:flex sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">{t("applyHint")}</p>
        <Button size="lg" className="w-full sm:w-auto" onClick={save} disabled={saving || count("skip") === decisions.length}>
          <CheckIcon /> {t("apply")}
        </Button>
      </div>
    </div>
  )
}
