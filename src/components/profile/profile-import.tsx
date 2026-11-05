"use client"

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
import { Checkbox } from "@/components/ui/checkbox"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import type { ProfileImport as Result } from "@/server/profile/ai-import"

/** Upload or paste a CV → review what was found → add the chosen entries as "needs review". */
export function ProfileImport() {
  const router = useRouter()
  const [text, setText] = useState("")
  const [file, setFile] = useState<File | null>(null)
  const [result, setResult] = useState<Result | null>(null)
  const [selected, setSelected] = useState<Set<number>>(new Set())
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
      setSelected(new Set(response.data.entries.map((_, index) => index)))
    })

  const save = () =>
    startSaving(async () => {
      if (!result) return
      const response = await saveImportAction({ language: result.language, identity: result.identity, entries: result.entries.filter((_, index) => selected.has(index)).map((entry) => ({ kind: entry.kind, title: entry.title, display: entry.display, facts: entry.facts, skills: entry.skills, bullets: entry.bullets })) })
      if (!response.ok) return void toast.error(response.message)
      toast.success(`${response.data.created} entr${response.data.created === 1 ? "y" : "ies"} added for review`, { description: response.data.skipped ? `${response.data.skipped} already in your profile were skipped.` : "Verify each one so documents can use it." })
      router.push("/profile")
    })

  const toggle = (index: number) => setSelected((current) => { const next = new Set(current); if (next.has(index)) next.delete(index); else next.add(index); return next })

  if (!result) {
    return (
      <div className="mx-auto grid w-full max-w-2xl gap-4">
        <Button variant="ghost" size="sm" className="w-fit" nativeButton={false} render={<Link href="/profile" />}>
          <ArrowLeftIcon /> Profile
        </Button>
        <Card>
          <CardHeader>
            <CardTitle>Start from your CV</CardTitle>
            <CardDescription>Upload a PDF or paste your CV, LinkedIn profile or notes. AI sorts it into jobs, studies, projects and skills, and splits achievements into facts. It never adds anything you didn’t write, and nothing is used until you verify it.</CardDescription>
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
              <span className="text-xs text-muted-foreground">PDF or text, up to 8 MB</span>
            </button>
            <input ref={input} type="file" accept=".pdf,.txt,.md,application/pdf,text/plain" className="hidden" onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span className="h-px flex-1 bg-border" /> or paste text <span className="h-px flex-1 bg-border" />
            </div>
            <Textarea value={text} onChange={(event) => setText(event.target.value)} placeholder="Paste your CV, your LinkedIn “About” and “Experience”, or just write about your jobs…" className="min-h-40" />
          </CardContent>
          <CardFooter className="justify-between gap-4 border-t">
            {reading ? <AiSteps steps={AI_STEPS.cvImport} step={step} /> : <span className="text-xs text-muted-foreground">Usually 15–40 seconds.</span>}
            <Button onClick={read} disabled={reading || (!file && text.trim().length < 80)}>
              <SparklesIcon className={reading ? "cb-breathe" : undefined} /> Read my CV
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
          <p className="text-sm text-muted-foreground">Untick anything you don’t want. Everything is added as “needs review”; you can edit each entry after.</p>
        </div>
        <Button onClick={save} disabled={saving || !selected.size}>
          <CheckIcon /> Add {selected.size} entr{selected.size === 1 ? "y" : "ies"}
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
        {result.entries.map((entry, index) => (
          <Card key={index} size="sm" className={cn("transition-opacity", !selected.has(index) && "opacity-50")}>
            <CardHeader>
              <div className="flex items-start gap-3">
                <Checkbox checked={selected.has(index)} onCheckedChange={() => toggle(index)} aria-label={`Include ${entry.title}`} className="mt-0.5" />
                <div className="grid min-w-0 gap-0.5">
                  <CardTitle className="truncate">{entry.display.role || entry.title}</CardTitle>
                  <CardDescription className="truncate">{[entry.display.organization, entry.display.dates, entry.display.location].filter(Boolean).join(" · ")}</CardDescription>
                </div>
              </div>
              <CardAction>
                <Badge variant="secondary">{KIND_SINGULAR[entry.kind] ?? entry.kind}</Badge>
              </CardAction>
            </CardHeader>
            {entry.facts.length || entry.skills.length ? (
              <CardContent className="grid gap-2 pl-11">
                {entry.facts.length ? (
                  <ul className="grid list-disc gap-1 pl-4 text-sm text-muted-foreground">
                    {entry.facts.slice(0, 6).map((fact) => (
                      <li key={fact}>{fact}</li>
                    ))}
                    {entry.facts.length > 6 ? <li className="list-none text-xs">+{entry.facts.length - 6} more facts</li> : null}
                  </ul>
                ) : null}
                {entry.skills.length ? (
                  <div className="flex flex-wrap gap-1">
                    {entry.skills.slice(0, 14).map((skill) => (
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
        ))}
      </div>
    </div>
  )
}
