"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { AlertTriangleIcon, ArrowLeftIcon, CheckCircle2Icon, CopyIcon, ExternalLinkIcon, GlobeIcon, SparklesIcon } from "lucide-react"
import { toast } from "sonner"
import { saveJobAction, type Duplicate } from "@/app/(app)/jobs/actions"
import { DRAFT_KEY, JobReader, type ReadResult } from "@/components/jobs/job-reader"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { STATUS_LABEL } from "@/lib/stages"
import { JobDescription } from "@/components/jobs/job-description"
import { LogoField } from "@/components/profile/editor/logo-field"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { cn } from "@/lib/utils"
import type { JobDraft } from "@/server/jobs/schema"

type Draft = JobDraft & { runId?: string }

const SOURCE_LABEL: Record<string, string> = {
  link: "found in a link on the posting",
  email: "from the recruiter's e-mail domain",
  text: "mentioned in the description",
  "structured-data": "from the posting's structured data",
  "posting-url": "from the posting address",
  "known company": "saved earlier",
  manual: "entered by you",
}

function sourceLabel(source: string) {
  if (!source || source === "none") return ""
  const [base, verified] = source.split("+")
  if (base === "guess") return "guessed from the name and verified on the site"
  return `${SOURCE_LABEL[base] ?? base}${verified ? ", verified on the site" : ""}`
}

export function NewJobFlow({ initialUrl = "", initialText = "", initial }: { initialUrl?: string; initialText?: string; initial?: ReadResult } = {}) {
  const router = useRouter()
  const [draft, setDraft] = useState<Draft | null>(initial?.draft ?? null)
  const [duplicates, setDuplicates] = useState<Duplicate[]>(initial?.duplicates ?? [])
  const [saving, startSaving] = useTransition()
  const [descriptionView, setDescriptionView] = useState<"preview" | "edit">("preview")

  // A page saved from the browser comes with its text: read that, keep the link as the source.
  const onRead = (result: ReadResult, source: { mode: "link" | "text" }) => {
    setDraft(source.mode === "text" && initialUrl && !result.draft.sourceUrl ? { ...result.draft, sourceUrl: initialUrl, canonicalUrl: initialUrl } : result.draft)
    setDuplicates(result.duplicates)
  }

  const save = () =>
    startSaving(async () => {
      if (!draft) return
      const result = await saveJobAction(draft)
      if (!result.ok) return void toast.error("Not saved", { description: result.error })
      // Next.js can keep this page mounted when navigating to the saved job.
      sessionStorage.removeItem(DRAFT_KEY)
      setDraft(null)
      setDuplicates([])
      setDescriptionView("preview")
      toast.success("Job saved")
      router.push(`/jobs/${result.data.id}`)
    })

  const patch = (value: Partial<Draft>) => setDraft((current) => (current ? { ...current, ...value } : current))

  if (!draft) {
    return (
      <div className="mx-auto grid w-full max-w-xl gap-3 pt-[8vh]">
        <Button variant="ghost" size="sm" className="w-fit" nativeButton={false} render={<Link href="/jobs" />}>
          <ArrowLeftIcon /> Jobs
        </Button>
        <Card>
          <CardHeader>
            <CardTitle className="text-xl">Add a job</CardTitle>
            <CardDescription>
              {initialText && initialUrl
                ? `Saved from your browser · ${new URL(initialUrl).hostname.replace(/^www\./, "")}. Read the text, check the details, then save.`
                : "Paste the link to the posting. Naruvi reads it, finds the company’s own website and logo, and lets you check everything before saving."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <JobReader onDone={onRead} initialUrl={initialUrl} initialText={initialText} />
          </CardContent>
        </Card>
      </div>
    )
  }

  const confidence = Math.round(draft.parseConfidence * 100)
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            sessionStorage.removeItem(DRAFT_KEY)
            setDraft(null)
            if (initial) router.replace("/jobs/new")
          }}
        >
          <ArrowLeftIcon /> Start over
        </Button>
        <div className="flex-1" />
        <Badge variant={confidence >= 85 ? "secondary" : "outline"} className={cn("gap-1", confidence < 85 && "border-amber-300 text-amber-700")}>
          {confidence >= 85 ? <CheckCircle2Icon className="size-3 text-emerald-600" /> : <AlertTriangleIcon className="size-3" />} Parsed with {confidence}% confidence
        </Badge>
        <Button onClick={save} disabled={saving}>
          {saving ? "Saving…" : "Save job"}
        </Button>
      </div>

      {duplicates.length ? (
        <Alert>
          <CopyIcon />
          <AlertTitle>{duplicates.some((item) => item.sameLink) ? "You already saved this posting" : "This looks like a job you already have"}</AlertTitle>
          <AlertDescription className="grid gap-2">
            <p>{duplicates.some((item) => item.sameLink) ? "Saving again updates the existing job with this text; your analysis and documents stay." : "Same company and a very similar title. Open the existing one, or save this as a separate job if it’s a different opening."}</p>
            <ul className="grid gap-1">
              {duplicates.map((item) => (
                <li key={item.id} className="flex flex-wrap items-center gap-2">
                  <Link href={item.applicationId ? `/applications/${item.applicationId}` : `/jobs/${item.id}`} className="font-medium text-foreground underline-offset-2 hover:underline">
                    {item.title}
                  </Link>
                  <span className="text-xs">
                    {item.company} · added {new Date(item.createdAt).toLocaleDateString(undefined, { day: "numeric", month: "short" })}
                    {item.status ? ` · ${STATUS_LABEL[item.status]}` : " · not analyzed"}
                  </span>
                </li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      ) : null}

      {draft.warnings.length ? (
        <div className="grid gap-1 rounded-lg border border-amber-200 bg-amber-50/60 p-3 text-sm dark:border-amber-900 dark:bg-amber-950/30">
          {draft.warnings.map((warning) => (
            <p key={warning} className="flex items-start gap-2">
              <AlertTriangleIcon className="mt-0.5 size-4 shrink-0 text-amber-600" /> {warning}
            </p>
          ))}
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <Card>
          <CardHeader>
            <CardTitle>Check the details</CardTitle>
            <CardDescription>Everything here is editable. Fix anything the parser got wrong before saving.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <Field label="Role" id="title" value={draft.title} hint={draft.hints?.title} onChange={(title) => patch({ title, hints: { ...draft.hints, title: "" } })} />
            <Field label="Company" id="company" value={draft.company} hint={draft.hints?.company} onChange={(company) => patch({ company, hints: { ...draft.hints, company: "" } })} />
            <div className="grid gap-2">
              <Label htmlFor="website">Company website</Label>
              <div className="flex gap-2">
                <Input id="website" value={draft.companyWebsite} onChange={(event) => patch({ companyWebsite: event.target.value, companyWebsiteSource: "manual" })} placeholder="https://company.com" />
                {draft.companyWebsite ? (
                  <Button variant="outline" size="icon" aria-label="Open website" nativeButton={false} render={<a href={draft.companyWebsite} target="_blank" rel="noreferrer" />}>
                    <ExternalLinkIcon />
                  </Button>
                ) : null}
              </div>
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <GlobeIcon className="size-3" />
                {draft.companyWebsite ? `Website ${sourceLabel(draft.companyWebsiteSource)}. Never the job board itself.` : "Not found. Adding it improves research and the logo."}
              </p>
            </div>
            <div className="grid gap-2">
              <Label>Logo</Label>
              <LogoField value={draft.logoPath} name={draft.company} onChange={(logoPath) => patch({ logoPath, logoSource: logoPath ? (logoPath === draft.logoPath ? draft.logoSource : "manual") : "" })} />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Location" id="location" value={draft.location} hint={draft.hints?.location} onChange={(location) => patch({ location, hints: { ...draft.hints, location: "" } })} />
              <Field label="Remote policy" id="remote" value={draft.remote} onChange={(remote) => patch({ remote })} placeholder="Hybrid, Remote…" />
              <Field label="Contract" id="employmentType" value={draft.employmentType} onChange={(employmentType) => patch({ employmentType })} placeholder="Full-time, CDI…" />
              <Field label="Salary" id="salary" value={draft.salary} onChange={(salary) => patch({ salary })} />
            </div>
            <div className="grid gap-2">
              <Label>Posting language</Label>
              <ToggleGroup value={[draft.language]} onValueChange={(value) => value[0] && patch({ language: value[0] })} variant="outline" size="sm" className="w-fit">
                {["en", "fr"].map((code) => (
                  <ToggleGroupItem key={code} value={code} className="px-3 aria-pressed:border-foreground aria-pressed:bg-foreground aria-pressed:text-background">
                    {code === "en" ? "English" : "French"}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
              <p className="text-xs text-muted-foreground">Your CV for this job will be written in this language by default.</p>
            </div>
          </CardContent>
        </Card>

        <Card className="min-h-0">
          <CardHeader>
            <CardTitle>Job description</CardTitle>
            <CardDescription>
              {draft.rawText.length.toLocaleString()} characters · saved unchanged
              {draft.sourceUrl ? (
                <>
                  {" · "}
                  <a href={draft.sourceUrl} target="_blank" rel="noreferrer" className="underline-offset-2 hover:underline">
                    open original
                  </a>
                </>
              ) : null}
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            <ToggleGroup value={[descriptionView]} onValueChange={(value) => value[0] && setDescriptionView(value[0] as "preview" | "edit")} variant="outline" size="sm" className="w-fit">
              <ToggleGroupItem value="preview" className="px-3 aria-pressed:border-foreground aria-pressed:bg-foreground aria-pressed:text-background">
                Preview
              </ToggleGroupItem>
              <ToggleGroupItem value="edit" className="px-3 aria-pressed:border-foreground aria-pressed:bg-foreground aria-pressed:text-background">
                Edit text
              </ToggleGroupItem>
            </ToggleGroup>
            {descriptionView === "preview" ? (
              <div className="max-h-[34rem] overflow-y-auto pr-2">
                <JobDescription text={draft.rawText} collapsible={false} />
              </div>
            ) : (
              <Textarea value={draft.rawText} onChange={(event) => patch({ rawText: event.target.value })} className="h-[34rem] resize-none font-sans text-sm leading-relaxed" aria-label="Job description" />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

const HINT_LABEL: Record<string, string> = {
  "labelled field": "a labelled field",
  "hiring sentence": "the hiring sentence",
  "phrase de recrutement": "the hiring sentence",
  "join sentence": "the “join us” sentence",
  "title line": "the title line",
  "first lines": "the first lines",
  "first line": "the first line",
  "about heading": "the “About …” heading",
  "location phrase": "a location mention",
}

function Field({ label, id, value, onChange, placeholder, hint }: { label: string; id: string; value: string; onChange: (value: string) => void; placeholder?: string; hint?: string }) {
  const empty = !value.trim()
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} aria-invalid={empty && (id === "title" || id === "company") ? true : undefined} />
      {hint && !empty ? (
        <p className="flex items-center gap-1 text-xs text-muted-foreground">
          <SparklesIcon className="size-3" /> Detected from {HINT_LABEL[hint] ?? hint} — check it.
        </p>
      ) : empty && (id === "title" || id === "company") ? (
        <p className="text-xs text-amber-600">Not found in the text. Please fill it in.</p>
      ) : null}
    </div>
  )
}
