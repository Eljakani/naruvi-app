"use client"

import { entryView } from "@/lib/entry-fields"
import { Otter } from "@/components/naruvi/otter"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useRef, useState, useTransition } from "react"
import { ArrowLeftIcon, CheckIcon, FileUpIcon, SparklesIcon } from "lucide-react"
import { toast } from "sonner"
import { readCvAction, saveImportAction } from "@/app/[locale]/(app)/profile/actions"
import { AI_STEPS, AiSteps, useStep } from "@/components/ai-progress"
import { KIND_SINGULAR, type Kind } from "@/components/profile/labels"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import type { ProfileImport } from "@/server/profile/ai-import"
import type { EntryMatch } from "@/server/profile/import-match"
import { useTranslations } from "next-intl"

type Result = Omit<ProfileImport, "entries"> & { entries: (ProfileImport["entries"][number] & { match: EntryMatch | null })[] }
type Decision = "new" | "merge" | "skip"

/** Default: update what you already have, add what's new, skip what adds nothing. */
const initialDecision = (entry: Result["entries"][number]): Decision => (!entry.match ? "new" : entry.match.newFacts.length || entry.match.newSkills.length ? "merge" : "skip")

/** Upload or paste a CV → review what was found → add the chosen entries as "needs review". */
export function ProfileImport() {
  const t = useTranslations("profileImport")
  const tk = useTranslations("profileLabels.kindSingular")
  const router = useRouter()
  const [text, setText] = useState("")
  const [file, setFile] = useState<File | null>(null)
  const [result, setResult] = useState<Result | null>(null)
  const [decisions, setDecisions] = useState<Decision[]>([])
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
    })

  const save = () =>
    startSaving(async () => {
      if (!result) return
      const response = await saveImportAction({
        language: result.language,
        identity: result.identity,
        entries: result.entries.filter((_, index) => decisions[index] === "new").map((entry) => ({ kind: entry.kind, text: entry.text, fields: entry.fields, facts: entry.facts, skills: entry.skills, bullets: entry.bullets })),
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
            <input ref={input} type="file" accept=".pdf,.txt,.md,.zip,.csv,application/pdf,text/plain,application/zip,text/csv" className="hidden" onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
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

      {id.fullName || id.email || id.headline ? (
        <Card size="sm">
          <CardHeader>
            <CardTitle>{id.fullName || t("you")}</CardTitle>
            <CardDescription>{[id.headline, id.location, id.email, id.phone].filter(Boolean).join(" · ")}</CardDescription>
            <CardAction>
              <Badge variant="outline">{t("fillsEmpty")}</Badge>
            </CardAction>
          </CardHeader>
        </Card>
      ) : null}

      <div className="cb-stagger grid gap-3">
        {result.entries.map((entry, index) => {
          const decision = decisions[index]
          const match = entry.match
          const facts = decision === "merge" && match ? match.newFacts : entry.facts
          const skills = decision === "merge" && match ? match.newSkills : entry.skills
          const view = entryView({ kind: entry.kind, display: { [result.language]: entry.text }, fields: entry.fields }, result.language)
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
                  {entry.unnamed && decision === "new" ? <p className="text-xs text-amber-700 dark:text-amber-400">{t("unnamed")}</p> : null}
                  {entry.dropped ? <p className="text-xs text-muted-foreground">{t("dropped", { count: entry.dropped })}</p> : null}
                </CardContent>
              ) : null}
            </Card>
          )
        })}
      </div>

      <div className="sticky bottom-0 -mx-2 grid gap-2 border-t bg-background/90 px-2 py-4 backdrop-blur sm:flex sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">{t("applyHint")}</p>
        <Button size="lg" className="w-full sm:w-auto" onClick={save} disabled={saving || count("skip") === decisions.length}>
          <CheckIcon /> {t("apply")}
        </Button>
      </div>
    </div>
  )
}
