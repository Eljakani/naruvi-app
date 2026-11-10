"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { AlertTriangleIcon, ArrowLeftIcon, CheckCircle2Icon, CopyIcon, ExternalLinkIcon, GlobeIcon, SparklesIcon } from "lucide-react"
import { toast } from "sonner"
import { saveJobAction, type Duplicate } from "@/app/[locale]/(app)/jobs/actions"
import { DRAFT_KEY, JobReader, type ReadResult } from "@/components/jobs/job-reader"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
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
import { useLocale, useTranslations } from "next-intl"
import { languageName } from "@/i18n/config"

type Draft = JobDraft & { runId?: string }

const SOURCE_KEY = { link: "link", email: "email", text: "text", "structured-data": "structured", "posting-url": "postingUrl", "known company": "known", manual: "manual", guess: "guess" } as const

function sourceLabel(source: string, t: ReturnType<typeof useTranslations<"newJob">>) {
  if (!source || source === "none") return ""
  const [base, verified] = source.split("+")
  const label = base in SOURCE_KEY ? t(`source.${SOURCE_KEY[base as keyof typeof SOURCE_KEY]}`) : base
  return base !== "guess" && verified ? t("source.verified", { source: label }) : label
}

export function NewJobFlow({ initialUrl = "", initialText = "", initial }: { initialUrl?: string; initialText?: string; initial?: ReadResult } = {}) {
  const tl = useTranslations("labels")
  const locale = useLocale()
  const t = useTranslations("newJob")
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
      if (!result.ok) return void toast.error(t("notSaved"), { description: result.error })
      // Next.js can keep this page mounted when navigating to the saved job.
      sessionStorage.removeItem(DRAFT_KEY)
      setDraft(null)
      setDuplicates([])
      setDescriptionView("preview")
      toast.success(t("saved"), { description: t("savedBody") })
      router.push(result.data.applicationId ? `/applications/${result.data.applicationId}` : `/jobs/${result.data.id}`)
    })

  const patch = (value: Partial<Draft>) => setDraft((current) => (current ? { ...current, ...value } : current))

  if (!draft) {
    return (
      <div className="mx-auto grid w-full max-w-xl gap-3 pt-[8vh]">
        <Button variant="ghost" size="sm" className="w-fit" nativeButton={false} render={<Link href="/applications" />}>
          <ArrowLeftIcon /> {t("applications")}
        </Button>
        <Card>
          <CardHeader>
            <CardTitle className="text-xl">{t("title")}</CardTitle>
            <CardDescription>
              {initialText && initialUrl
                ? t("fromBrowser", { host: new URL(initialUrl).hostname.replace(/^www\./, "") })
                : t("description")}
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
          <ArrowLeftIcon /> {t("startOver")}
        </Button>
        <div className="flex-1" />
        <Badge variant={confidence >= 85 ? "secondary" : "outline"} className={cn("gap-1", confidence < 85 && "border-amber-300 text-amber-700")}>
          {confidence >= 85 ? <CheckCircle2Icon className="size-3 text-emerald-600" /> : <AlertTriangleIcon className="size-3" />} {t("confidence", { confidence })}
        </Badge>
        <Button onClick={save} disabled={saving}>
          {saving ? t("saving") : t("save")}
        </Button>
      </div>

      {duplicates.length ? (
        <Alert>
          <CopyIcon />
          <AlertTitle>{duplicates.some((item) => item.sameLink) ? t("dup.same") : t("dup.similar")}</AlertTitle>
          <AlertDescription className="grid gap-2">
            <p>{duplicates.some((item) => item.sameLink) ? t("dup.sameBody") : t("dup.similarBody")}</p>
            <ul className="grid gap-1">
              {duplicates.map((item) => (
                <li key={item.id} className="flex flex-wrap items-center gap-2">
                  <Link href={item.applicationId ? `/applications/${item.applicationId}` : `/jobs/${item.id}`} className="font-medium text-foreground underline-offset-2 hover:underline">
                    {item.title}
                  </Link>
                  <span className="text-xs">
                    {item.company} · {t("dup.added", { date: new Date(item.createdAt).toLocaleDateString(locale, { day: "numeric", month: "short" }) })}
                    {item.status ? ` · ${tl(`status.${item.status}`)}` : ` · ${t("dup.notAnalyzed")}`}
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
            <CardTitle>{t("details")}</CardTitle>
            <CardDescription>{t("detailsBody")}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <Field label={t("fields.role")} id="title" value={draft.title} hint={draft.hints?.title} onChange={(title) => patch({ title, hints: { ...draft.hints, title: "" } })} />
            <Field label={t("fields.company")} id="company" value={draft.company} hint={draft.hints?.company} onChange={(company) => patch({ company, hints: { ...draft.hints, company: "" } })} />
            <div className="grid gap-2">
              <Label htmlFor="website">{t("fields.website")}</Label>
              <div className="flex gap-2">
                <Input id="website" value={draft.companyWebsite} onChange={(event) => patch({ companyWebsite: event.target.value, companyWebsiteSource: "manual" })} placeholder="https://company.com" />
                {draft.companyWebsite ? (
                  <Button variant="outline" size="icon" aria-label={t("openWebsite")} nativeButton={false} render={<a href={draft.companyWebsite} target="_blank" rel="noreferrer" />}>
                    <ExternalLinkIcon />
                  </Button>
                ) : null}
              </div>
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <GlobeIcon className="size-3" />
                {draft.companyWebsite ? t("websiteFrom", { source: sourceLabel(draft.companyWebsiteSource, t) }) : t("websiteMissing")}
              </p>
            </div>
            <div className="grid gap-2">
              <Label>{t("fields.logo")}</Label>
              <LogoField value={draft.logoPath} name={draft.company} onChange={(logoPath) => patch({ logoPath, logoSource: logoPath ? (logoPath === draft.logoPath ? draft.logoSource : "manual") : "" })} />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t("fields.location")} id="location" value={draft.location} hint={draft.hints?.location} onChange={(location) => patch({ location, hints: { ...draft.hints, location: "" } })} />
              <Field label={t("fields.remote")} id="remote" value={draft.remote} onChange={(remote) => patch({ remote })} placeholder={t("fields.remotePlaceholder")} />
              <Field label={t("fields.contract")} id="employmentType" value={draft.employmentType} onChange={(employmentType) => patch({ employmentType })} placeholder={t("fields.contractPlaceholder")} />
              <Field label={t("fields.salary")} id="salary" value={draft.salary} onChange={(salary) => patch({ salary })} />
            </div>
            <div className="grid gap-2">
              <Label>{t("fields.language")}</Label>
              <ToggleGroup value={[draft.language]} onValueChange={(value) => value[0] && patch({ language: value[0] })} variant="outline" size="sm" className="w-fit">
                {["en", "fr"].map((code) => (
                  <ToggleGroupItem key={code} value={code} className="px-3 aria-pressed:border-foreground aria-pressed:bg-foreground aria-pressed:text-background">
                    {languageName(code, locale)}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
              <p className="text-xs text-muted-foreground">{t("languageHint")}</p>
            </div>
          </CardContent>
        </Card>

        <Card className="min-h-0">
          <CardHeader>
            <CardTitle>{t("descriptionTitle")}</CardTitle>
            <CardDescription>
              {t("chars", { count: draft.rawText.length })}
              {draft.sourceUrl ? (
                <>
                  {" · "}
                  <a href={draft.sourceUrl} target="_blank" rel="noreferrer" className="underline-offset-2 hover:underline">
                    {t("openOriginal")}
                  </a>
                </>
              ) : null}
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            <ToggleGroup value={[descriptionView]} onValueChange={(value) => value[0] && setDescriptionView(value[0] as "preview" | "edit")} variant="outline" size="sm" className="w-fit">
              <ToggleGroupItem value="preview" className="px-3 aria-pressed:border-foreground aria-pressed:bg-foreground aria-pressed:text-background">
                {t("preview")}
              </ToggleGroupItem>
              <ToggleGroupItem value="edit" className="px-3 aria-pressed:border-foreground aria-pressed:bg-foreground aria-pressed:text-background">
                {t("editText")}
              </ToggleGroupItem>
            </ToggleGroup>
            {descriptionView === "preview" ? (
              <div className="max-h-[34rem] overflow-y-auto pe-2">
                <JobDescription text={draft.rawText} collapsible={false} />
              </div>
            ) : (
              <Textarea value={draft.rawText} onChange={(event) => patch({ rawText: event.target.value })} className="h-[34rem] resize-none font-sans text-sm leading-relaxed" aria-label={t("descriptionTitle")} />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

const HINT_KEY = { "labelled field": "labelled", "hiring sentence": "hiring", "phrase de recrutement": "hiring", "join sentence": "join", "title line": "titleLine", "first lines": "firstLines", "first line": "firstLine", "about heading": "about", "location phrase": "location" } as const

function Field({ label, id, value, onChange, placeholder, hint }: { label: string; id: string; value: string; onChange: (value: string) => void; placeholder?: string; hint?: string }) {
  const t = useTranslations("newJob")
  const empty = !value.trim()
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} aria-invalid={empty && (id === "title" || id === "company") ? true : undefined} />
      {hint && !empty ? (
        <p className="flex items-center gap-1 text-xs text-muted-foreground">
          <SparklesIcon className="size-3" /> {t("detected", { from: hint in HINT_KEY ? t(`hints.${HINT_KEY[hint as keyof typeof HINT_KEY]}`) : hint })}
        </p>
      ) : empty && (id === "title" || id === "company") ? (
        <p className="text-xs text-amber-600">{t("notFound")}</p>
      ) : null}
    </div>
  )
}
