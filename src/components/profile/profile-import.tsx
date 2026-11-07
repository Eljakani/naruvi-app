"use client"

import { Otter } from "@/components/naruvi/otter"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useRef, useState, useTransition } from "react"
import { ArrowLeftIcon, CheckIcon, FileUpIcon, SparklesIcon } from "lucide-react"
import { toast } from "sonner"
import { readCvAction, saveImportAction } from "@/app/(app)/profile/actions"
import { AI_STEPS, AiSteps, useStep } from "@/components/ai-progress"
import { KIND_SINGULAR } from "@/components/profile/labels"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import type { ProfileImport } from "@/server/profile/ai-import"
import type { EntryMatch } from "@/server/profile/import-match"

type Result = Omit<ProfileImport, "entries"> & { entries: (ProfileImport["entries"][number] & { match: EntryMatch | null })[] }
type Decision = "new" | "merge" | "skip"

/** Default: update what you already have, add what's new, skip what adds nothing. */
const initialDecision = (entry: Result["entries"][number]): Decision => (!entry.match ? "new" : entry.match.newFacts.length || entry.match.newSkills.length ? "merge" : "skip")

/** Upload or paste a CV → review what was found → add the chosen entries as "needs review". */
export function ProfileImport() {
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
        entries: result.entries.filter((_, index) => decisions[index] === "new").map((entry) => ({ kind: entry.kind, title: entry.title, display: entry.display, facts: entry.facts, skills: entry.skills, bullets: entry.bullets })),
        merges: result.entries.flatMap((entry, index) => (decisions[index] === "merge" && entry.match ? [{ entryId: entry.match.entryId, facts: entry.match.newFacts, skills: entry.match.newSkills, display: entry.display }] : [])),
      })
      if (!response.ok) return void toast.error(response.message)
      const { created, merged, factsAdded, reverify } = response.data
      toast.success([created ? `${created} new entr${created === 1 ? "y" : "ies"}` : "", merged ? `${merged} updated (+${factsAdded} facts)` : ""].filter(Boolean).join(" · ") || "Nothing to add", { description: reverify ? `${reverify} verified entr${reverify === 1 ? "y needs" : "ies need"} a quick re-check for the new facts.` : "Everything new is waiting for your review." })
      router.push("/profile")
    })

  const decide = (index: number, value: Decision) => setDecisions((current) => current.map((item, i) => (i === index ? value : item)))
  const count = (value: Decision) => decisions.filter((item) => item === value).length

  if (!result) {
    return (
      <div className="mx-auto grid w-full max-w-2xl gap-4">
        <Button variant="ghost" size="sm" className="w-fit" nativeButton={false} render={<Link href="/profile" />}>
          <ArrowLeftIcon /> Profile
        </Button>
        <Card>
          <CardHeader>
            <div className="flex items-end gap-4">
              <Otter pose="reading-stack" height={92} className="-mb-1 shrink-0" priority />
              <div className="grid gap-1.5">
                <CardTitle>Start from your CV</CardTitle>
                <CardDescription className="max-w-[30rem]">Give me your CV, your LinkedIn export or a few notes. I’ll sort it into jobs, studies, projects and skills, and split achievements into facts. I never add anything you didn’t write, and nothing is used until you verify it.</CardDescription>
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
              <span className="text-sm font-medium">{file ? file.name : "Drop your CV here or click to choose"}</span>
              <span className="text-xs text-muted-foreground">PDF, LinkedIn export (.zip) or text, up to 8 MB</span>
            </button>
            <input ref={input} type="file" accept=".pdf,.txt,.md,.zip,.csv,application/pdf,text/plain,application/zip,text/csv" className="hidden" onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span className="h-px flex-1 bg-border" /> or paste text <span className="h-px flex-1 bg-border" />
            </div>
            <Textarea value={text} onChange={(event) => setText(event.target.value)} placeholder="Paste your CV, your LinkedIn “About” and “Experience”, or just write about your jobs…" className="min-h-40" />
          </CardContent>
          <CardFooter className="justify-between gap-4 border-t">
            {reading ? <AiSteps steps={AI_STEPS.cvImport} step={step} /> : <span className="text-xs text-muted-foreground">Usually 15–40 seconds. I’ll show you everything before saving.</span>}
            <Button onClick={read} disabled={reading || (!file && text.trim().length < 80)}>
              <SparklesIcon className={reading ? "cb-breathe" : "text-brand"} /> Read my CV
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
        <ArrowLeftIcon /> Start over
      </Button>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Here’s what we found</h1>
          <p className="text-sm text-muted-foreground">
            {count("new")} new · {count("merge")} to update · {count("skip")} skipped. Entries you already have are updated with only what’s new; nothing you wrote is overwritten.
          </p>
        </div>
        <Button onClick={save} disabled={saving || count("skip") === decisions.length}>
          <CheckIcon /> Apply
        </Button>
      </div>

      {id.fullName || id.email || id.headline ? (
        <Card size="sm">
          <CardHeader>
            <CardTitle>{id.fullName || "You"}</CardTitle>
            <CardDescription>{[id.headline, id.location, id.email, id.phone].filter(Boolean).join(" · ")}</CardDescription>
            <CardAction>
              <Badge variant="outline">Fills empty fields only</Badge>
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
          return (
            <Card key={index} size="sm" className={cn("transition-opacity", decision === "skip" && "opacity-50")}>
              <CardHeader>
                <CardTitle className="truncate">{entry.display.role || entry.title}</CardTitle>
                <CardDescription className="truncate">
                  {KIND_SINGULAR[entry.kind] ?? entry.kind}
                  {[entry.display.organization, entry.display.dates, entry.display.location].filter(Boolean).map((part) => ` · ${part}`)}
                </CardDescription>
                <CardAction>
                  <ToggleGroup value={[decision]} onValueChange={(value) => value[0] && decide(index, value[0] as Decision)} variant="outline" size="sm" aria-label={`What to do with ${entry.title}`}>
                    {match ? <ToggleGroupItem value="merge">Update</ToggleGroupItem> : null}
                    <ToggleGroupItem value="new">{match ? "Add as new" : "Add"}</ToggleGroupItem>
                    <ToggleGroupItem value="skip">Skip</ToggleGroupItem>
                  </ToggleGroup>
                </CardAction>
              </CardHeader>
              {decision !== "skip" || match ? (
                <CardContent className="grid gap-2">
                  {match ? (
                    <p className="text-xs text-muted-foreground">
                      Matches <span className="font-medium text-foreground">{match.title}</span> in your profile
                      {match.knownFacts ? ` · ${match.knownFacts} fact${match.knownFacts === 1 ? "" : "s"} already there` : ""}
                      {decision === "merge" && !facts.length && !skills.length ? " · nothing new to add" : ""}
                      {decision === "merge" && facts.length && match.status === "verified" ? " · it will need a quick re-check" : ""}
                    </p>
                  ) : null}
                  {decision !== "skip" && facts.length ? (
                    <ul className="grid list-disc gap-1 pl-4 text-sm text-muted-foreground">
                      {facts.slice(0, 6).map((fact) => (
                        <li key={fact}>{decision === "merge" ? <span className="text-foreground">+ </span> : null}{fact}</li>
                      ))}
                      {facts.length > 6 ? <li className="list-none text-xs">+{facts.length - 6} more</li> : null}
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
                  {entry.dropped ? <p className="text-xs text-muted-foreground">{entry.dropped} item(s) left out: their numbers weren’t in your CV.</p> : null}
                </CardContent>
              ) : null}
            </Card>
          )
        })}
      </div>
    </div>
  )
}
