"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useState, useTransition } from "react"
import { AlertTriangleIcon, ArrowLeftIcon, CheckCircle2Icon, CopyIcon, ExternalLinkIcon, Loader2Icon, GlobeIcon, SparklesIcon } from "lucide-react"
import { toast } from "sonner"
import { saveJobAction, siteLogoAction, type Duplicate } from "@/app/[locale]/(app)/jobs/actions"
import type { ReadResult } from "@/components/jobs/job-reader"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { JobDescription } from "@/components/jobs/job-description"
import { LogoField } from "@/components/profile/editor/logo-field"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
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

/** The review of a read posting: check the fields, then save. Lives in the Add-a-job dialog. */
export function JobReview({ initial, onBack, onSaved }: { initial: ReadResult; onBack: () => void; onSaved: () => void }) {
  const tl = useTranslations("labels")
  const locale = useLocale()
  const t = useTranslations("newJob")
  const router = useRouter()
  const [draft, setDraft] = useState<Draft>(initial.draft)
  const duplicates: Duplicate[] = initial.duplicates
  const [saving, startSaving] = useTransition()
  const [descriptionView, setDescriptionView] = useState<"preview" | "edit">("preview")

  const save = () =>
    startSaving(async () => {
      const result = await saveJobAction(draft)
      if (!result.ok) return void toast.error(t("notSaved"), { description: result.error })
      toast.success(t("saved"), { description: t(result.data.checking ? "savedChecking" : "savedBody") })
      onSaved()
      router.push(result.data.applicationId ? `/applications/${result.data.applicationId}` : `/jobs/${result.data.id}`)
    })

  const patch = (value: Partial<Draft>) => setDraft((current) => ({ ...current, ...value }))

  // A website typed or pasted here: once it settles, fetch its logo, unless you chose a logo yourself.
  const [logoLookup, setLogoLookup] = useState<"idle" | "looking" | "none">("idle")
  const website = draft.companyWebsiteSource === "manual" ? draft.companyWebsite.trim() : ""
  const ownLogo = draft.logoSource === "manual"
  useEffect(() => {
    if (!/^(https?:\/\/)?[\w-]+(\.[\w-]+)+/i.test(website) || ownLogo) return
    let stale = false
    const timer = setTimeout(async () => {
      setLogoLookup("looking")
      const result = await siteLogoAction(website).catch(() => ({ ok: false as const }))
      if (stale) return
      if (result.ok && result.logoPath) {
        setDraft((current) => (current.logoSource === "manual" ? current : { ...current, logoPath: result.logoPath, logoSource: "company website" }))
        setLogoLookup("idle")
      } else setLogoLookup("none")
    }, 700)
    return () => {
      stale = true
      clearTimeout(timer)
    }
  }, [website, ownLogo])

  // The missing-website warning goes once you add one.
  const warnings = draft.warnings.filter((warning) => !(draft.companyWebsite.trim() && /^Company website not found/.test(warning)))
  // What still deserves a look, by name: more useful than a confidence figure nobody can act on.
  const toCheck = [
    !draft.title.trim() ? t("missing.title") : "",
    !draft.company.trim() ? t("missing.company") : "",
    !draft.location.trim() ? t("missing.location") : "",
    !draft.companyWebsite.trim() ? t("missing.website") : "",
    draft.rawText.trim().length < 400 ? t("missing.short") : "",
  ].filter(Boolean)
  const blocked = !draft.title.trim() || !draft.company.trim()
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="grid min-h-0 flex-1 overflow-y-auto lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] lg:overflow-hidden">
        <section className="grid content-start gap-4 border-b p-5 lg:min-h-0 lg:overflow-y-auto lg:border-e lg:border-b-0">
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

        {warnings.length ? (
          <div className="grid gap-1 rounded-lg border border-amber-200 bg-amber-50/60 p-3 text-sm dark:border-amber-900 dark:bg-amber-950/30">
            {warnings.map((warning) => (
              <p key={warning} className="flex items-start gap-2">
                <AlertTriangleIcon className="mt-0.5 size-4 shrink-0 text-amber-600" /> {warning}
              </p>
            ))}
          </div>
        ) : null}

          <header className="grid gap-0.5">
            <h3 className="text-sm font-semibold tracking-tight">{t("details")}</h3>
            <p className="text-xs text-muted-foreground">{t("detailsBody")}</p>
          </header>

          <Group title={t("groups.role")}>
            <Field label={t("fields.role")} id="title" value={draft.title} hint={draft.hints?.title} required onChange={(title) => patch({ title, hints: { ...draft.hints, title: "" } })} />
            <Field label={t("fields.company")} id="company" value={draft.company} hint={draft.hints?.company} required onChange={(company) => patch({ company, hints: { ...draft.hints, company: "" } })} />
          </Group>

          <Group title={t("groups.company")}>
            <div className="grid content-start gap-1.5">
              <FieldLabel htmlFor="website" label={t("fields.website")} hint={draft.companyWebsite ? t("websiteFrom", { source: sourceLabel(draft.companyWebsiteSource, t) }) : undefined} hintIcon={GlobeIcon} />
              <div className="flex gap-2">
                <Input id="website" value={draft.companyWebsite} onChange={(event) => patch({ companyWebsite: event.target.value, companyWebsiteSource: "manual" })} placeholder="https://company.com" inputMode="url" />
                {draft.companyWebsite ? (
                  <Button variant="outline" size="icon" className="shrink-0" aria-label={t("openWebsite")} nativeButton={false} render={<a href={draft.companyWebsite} target="_blank" rel="noreferrer" />}>
                    <ExternalLinkIcon />
                  </Button>
                ) : null}
              </div>
              {draft.companyWebsite ? null : <p className="text-xs text-muted-foreground">{t("websiteMissing")}</p>}
            </div>
            <div className="grid content-start gap-1.5">
              <FieldLabel label={t("fields.logo")} />
              <LogoField value={draft.logoPath} name={draft.company} hint={t("logoHint")} onChange={(logoPath) => patch({ logoPath, logoSource: logoPath ? (logoPath === draft.logoPath ? draft.logoSource : "manual") : "" })} />
              {logoLookup === "looking" ? (
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground animate-in fade-in-0"><Loader2Icon className="size-3 animate-spin" /> {t("logoLooking")}</p>
              ) : logoLookup === "none" && !draft.logoPath ? (
                <p className="text-xs text-muted-foreground animate-in fade-in-0">{t("logoNotFound")}</p>
              ) : null}
            </div>
          </Group>

          <Group title={t("groups.terms")} columns>
            <Field label={t("fields.location")} id="location" value={draft.location} hint={draft.hints?.location} onChange={(location) => patch({ location, hints: { ...draft.hints, location: "" } })} />
            <Field label={t("fields.remote")} id="remote" value={draft.remote} hint={draft.hints?.remote} onChange={(remote) => patch({ remote })} placeholder={t("fields.remotePlaceholder")} />
            <Field label={t("fields.contract")} id="employmentType" value={draft.employmentType} hint={draft.hints?.employmentType} onChange={(employmentType) => patch({ employmentType })} placeholder={t("fields.contractPlaceholder")} />
            <Field label={t("fields.salary")} id="salary" value={draft.salary} onChange={(salary) => patch({ salary })} />
          </Group>

          <Group title={t("groups.language")}>
            <div className="grid content-start gap-1.5">
              <ToggleGroup value={[draft.language]} onValueChange={(value) => value[0] && patch({ language: value[0] })} variant="outline" size="sm" className="w-fit" aria-label={t("fields.language")}>
                {["en", "fr"].map((code) => (
                  <ToggleGroupItem key={code} value={code} className="px-3 aria-pressed:border-foreground aria-pressed:bg-foreground aria-pressed:text-background">
                    {languageName(code, locale)}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
              <p className="text-xs text-muted-foreground">{t("languageHint")}</p>
            </div>
          </Group>
        </section>

        <section className="flex flex-col lg:min-h-0">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-popover/95 px-5 py-3 backdrop-blur lg:sticky lg:top-0">
            <div className="grid gap-0.5">
              <h3 className="text-sm font-semibold">{t("descriptionTitle")}</h3>
              <p className="text-xs text-muted-foreground">
              {t("chars", { count: draft.rawText.length })}
              {draft.sourceUrl ? (
                <>
                  {" · "}
                  <a href={draft.sourceUrl} target="_blank" rel="noreferrer" className="underline-offset-2 hover:underline">
                    {t("openOriginal")}
                  </a>
                </>
              ) : null}
              </p>
            </div>
            <ToggleGroup value={[descriptionView]} onValueChange={(value) => value[0] && setDescriptionView(value[0] as "preview" | "edit")} variant="outline" size="sm" className="w-fit">
              <ToggleGroupItem value="preview" className="px-3 aria-pressed:border-foreground aria-pressed:bg-foreground aria-pressed:text-background">
                {t("preview")}
              </ToggleGroupItem>
              <ToggleGroupItem value="edit" className="px-3 aria-pressed:border-foreground aria-pressed:bg-foreground aria-pressed:text-background">
                {t("editText")}
              </ToggleGroupItem>
            </ToggleGroup>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
            {descriptionView === "preview" ? (
              <JobDescription key="preview" text={draft.rawText} collapsible={false} className="animate-in fade-in-0 duration-200" />
            ) : (
              <Textarea value={draft.rawText} onChange={(event) => patch({ rawText: event.target.value })} className="min-h-[28rem] resize-none font-sans text-sm leading-relaxed animate-in fade-in-0 duration-200 lg:h-full" aria-label={t("descriptionTitle")} />
            )}
          </div>
        </section>
      </div>

      <footer className="flex flex-wrap items-center gap-3 border-t bg-popover px-5 py-3">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeftIcon data-icon="inline-start" /> {t("startOver")}
        </Button>
        <div className="flex-1" />
        {toCheck.length ? (
          <Tooltip>
            <TooltipTrigger render={<Badge variant="outline" className="cursor-help gap-1 border-amber-300 text-amber-700 dark:border-amber-700 dark:text-amber-400" />}>
              <AlertTriangleIcon className="size-3" /> {t("toCheck", { count: toCheck.length })}
            </TooltipTrigger>
            <TooltipContent className="max-w-64">
              <ul className="grid gap-0.5">{toCheck.map((item) => <li key={item}>{item}</li>)}</ul>
            </TooltipContent>
          </Tooltip>
        ) : (
          <Badge variant="secondary" className="gap-1">
            <CheckCircle2Icon className="size-3 text-emerald-600" /> {t("allFound")}
          </Badge>
        )}
        <Button onClick={save} disabled={saving || blocked}>
          {saving ? <Loader2Icon className="animate-spin" data-icon="inline-start" /> : null} {saving ? t("saving") : t("save")}
        </Button>
      </footer>
    </div>
  )
}

const HINT_KEY = { "labelled field": "labelled", "hiring sentence": "hiring", "phrase de recrutement": "hiring", "join sentence": "join", "title line": "titleLine", "first lines": "firstLines", "first line": "firstLine", "about heading": "about", "location phrase": "location" } as const

/** A titled block of related fields; `columns` pairs them two by two on wider screens. */
function Group({ title, columns = false, children }: { title: string; columns?: boolean; children: React.ReactNode }) {
  return (
    <fieldset className="grid gap-3 border-t pt-4 first-of-type:border-t-0 first-of-type:pt-0">
      <legend className="float-left mb-1 w-full text-[0.7rem] font-medium tracking-wide text-muted-foreground uppercase">{title}</legend>
      <div className={cn("grid gap-x-4 gap-y-4", columns && "sm:grid-cols-2")}>{children}</div>
    </fieldset>
  )
}

/** A field label with where its value came from as a small mark beside it, so hints never change a row's height. */
function FieldLabel({ label, htmlFor, hint, hintIcon: Icon = SparklesIcon }: { label: string; htmlFor?: string; hint?: string; hintIcon?: typeof SparklesIcon }) {
  return (
    <div className="flex h-5 min-w-0 items-center gap-1.5">
      <Label htmlFor={htmlFor} className="truncate">{label}</Label>
      {hint ? (
        <Tooltip>
          <TooltipTrigger render={<span className="inline-flex size-4 shrink-0 cursor-help items-center justify-center rounded-sm text-muted-foreground/70 hover:text-foreground" />}>
            <Icon className="size-3" aria-hidden />
            <span className="sr-only">{hint}</span>
          </TooltipTrigger>
          <TooltipContent className="max-w-64">{hint}</TooltipContent>
        </Tooltip>
      ) : null}
    </div>
  )
}

/** Where the parser found a value, in words ("AI (found in posting)" → "l’IA, dans l’annonce"). */
function hintText(hint: string, t: ReturnType<typeof useTranslations<"newJob">>) {
  const key = /^AI\b/i.test(hint) ? "ai" : /^decision model$/i.test(hint) ? "ai" : hint in HINT_KEY ? HINT_KEY[hint as keyof typeof HINT_KEY] : null
  return t("detected", { from: key ? t(`hints.${key}`) : hint })
}

function Field({ label, id, value, onChange, placeholder, hint, required = false }: { label: string; id: string; value: string; onChange: (value: string) => void; placeholder?: string; hint?: string; required?: boolean }) {
  const t = useTranslations("newJob")
  const empty = !value.trim()
  return (
    <div className="grid min-w-0 content-start gap-1.5">
      <FieldLabel htmlFor={id} label={label} hint={hint && !empty ? hintText(hint, t) : undefined} />
      <Input id={id} value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} title={value.length > 40 ? value : undefined} aria-invalid={empty && required ? true : undefined} />
      {empty && required ? <p className="text-xs text-amber-600 dark:text-amber-400">{t("notFound")}</p> : null}
    </div>
  )
}
