"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import {
  AlertTriangleIcon,
  ArrowLeftIcon,
  CheckCircle2Icon,
  ClipboardPasteIcon,
  ExternalLinkIcon,
  GlobeIcon,
  LinkIcon,
  Loader2Icon,
  SparklesIcon,
} from "lucide-react"
import { toast } from "sonner"
import { previewJobAction, saveJobAction } from "@/app/(app)/jobs/actions"
import { JobDescription } from "@/components/jobs/job-description"
import { LogoField } from "@/components/profile/editor/logo-field"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Progress } from "@/components/ui/progress"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { cn } from "@/lib/utils"
import type { JobDraft } from "@/server/jobs/schema"

type Draft = JobDraft & { runId?: string }

const BOARDS = ["LinkedIn", "Greenhouse", "Lever", "Ashby", "SmartRecruiters", "Workday", "Welcome to the Jungle", "any careers page"]
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

export function NewJobFlow() {
  const router = useRouter()
  const [mode, setMode] = useState<"link" | "text">("link")
  const [url, setUrl] = useState("")
  const [text, setText] = useState("")
  const [draft, setDraft] = useState<Draft | null>(null)
  const [reading, startReading] = useTransition()
  const [saving, startSaving] = useTransition()
  const [descriptionView, setDescriptionView] = useState<"preview" | "edit">("preview")

  const read = () =>
    startReading(async () => {
      const result = await previewJobAction(mode === "link" ? { url } : { text })
      if (!result.ok) return void toast.error("Couldn't read that posting", { description: result.error })
      setDraft(result.data)
    })

  const save = () =>
    startSaving(async () => {
      if (!draft) return
      const result = await saveJobAction(draft)
      if (!result.ok) return void toast.error("Not saved", { description: result.error })
      toast.success("Job saved")
      router.push(`/jobs/${result.data.id}`)
    })

  const patch = (value: Partial<Draft>) => setDraft((current) => (current ? { ...current, ...value } : current))

  if (!draft) {
    return (
      <div className="mx-auto grid w-full max-w-2xl gap-4">
        <Button variant="ghost" size="sm" className="w-fit" nativeButton={false} render={<Link href="/jobs" />}>
          <ArrowLeftIcon /> Jobs
        </Button>
        <Card>
          <CardHeader>
            <CardTitle className="text-xl">Add a job</CardTitle>
            <CardDescription>Paste the link to the posting. CareerBuddy reads it, finds the real company website and logo, and lets you check everything before saving.</CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs value={mode} onValueChange={(value) => setMode(value as "link" | "text")}>
              <TabsList>
                <TabsTrigger value="link">
                  <LinkIcon /> Link
                </TabsTrigger>
                <TabsTrigger value="text">
                  <ClipboardPasteIcon /> Paste text
                </TabsTrigger>
              </TabsList>
              <TabsContent value="link" className="grid gap-3 pt-3">
                <form
                  onSubmit={(event) => {
                    event.preventDefault()
                    read()
                  }}
                  className="flex gap-2"
                >
                  <Input autoFocus value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://jobs.lever.co/acme/…" aria-label="Job link" className="h-10" />
                  <Button type="submit" size="lg" disabled={reading || !url.trim()}>
                    {reading ? <Loader2Icon className="animate-spin" /> : <SparklesIcon />} Read
                  </Button>
                </form>
                <div className="flex flex-wrap gap-1.5">
                  {BOARDS.map((board) => (
                    <Badge key={board} variant="secondary" className="font-normal">
                      {board}
                    </Badge>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">If the site needs a login (LinkedIn sometimes does), use “Paste text” instead.</p>
              </TabsContent>
              <TabsContent value="text" className="grid gap-3 pt-3">
                <Textarea value={text} onChange={(event) => setText(event.target.value)} rows={10} placeholder="Paste the full job description, including the company name and role." aria-label="Job description" />
                <Button className="w-fit" onClick={read} disabled={reading || text.trim().length < 80}>
                  {reading ? <Loader2Icon className="animate-spin" /> : <SparklesIcon />} Read text
                </Button>
              </TabsContent>
            </Tabs>
          </CardContent>
          {reading ? (
            <CardFooter className="grid gap-2 border-t">
              <Progress value={null} className="h-1" />
              <p className="text-xs text-muted-foreground">Reading the posting, resolving the company website, looking for a square logo…</p>
            </CardFooter>
          ) : null}
        </Card>
      </div>
    )
  }

  const confidence = Math.round(draft.parseConfidence * 100)
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => setDraft(null)}>
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
            <Field label="Role" id="title" value={draft.title} onChange={(title) => patch({ title })} />
            <Field label="Company" id="company" value={draft.company} onChange={(company) => patch({ company })} />
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
              <Field label="Location" id="location" value={draft.location} onChange={(location) => patch({ location })} />
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

function Field({ label, id, value, onChange, placeholder }: { label: string; id: string; value: string; onChange: (value: string) => void; placeholder?: string }) {
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} />
    </div>
  )
}
