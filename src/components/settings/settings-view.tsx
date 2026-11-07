"use client"

import Link from "next/link"
import { useState, useTransition } from "react"
import { ArrowDownToLineIcon, DatabaseIcon, FileTextIcon, Loader2Icon, PaletteIcon, SparklesIcon, TypeIcon } from "lucide-react"
import { toast } from "sonner"
import { downloadFontsAction, saveDocumentPhotoDefaultAction, setDefaultLanguageAction } from "@/app/(app)/settings/actions"
import { DecisionSettings } from "./decision-settings"
import { SectionLayout, SectionNav, SettingsSection } from "@/components/section-nav"
import { ModelSettings } from "./model-settings"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldContent, FieldDescription, FieldGroup, FieldLabel, FieldSeparator, FieldTitle } from "@/components/ui/field"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import type { DocumentDefaults, getSystemOverview } from "@/server/settings/service"

type Overview = Awaited<ReturnType<typeof getSystemOverview>>

const LANGS = [
  { value: "en", label: "English" },
  { value: "fr", label: "Français" },
  { value: "es", label: "Español" },
  { value: "de", label: "Deutsch" },
]

const FONT_NAMES: Record<string, string> = { SC: "Chinese (Simplified)", JP: "Japanese", KR: "Korean" }

const sections = [
  { id: "ai", title: "AI models", icon: SparklesIcon },
  { id: "documents", title: "Documents", icon: FileTextIcon },
  { id: "data", title: "Data & storage", icon: DatabaseIcon },
] as const


export function SettingsView({ overview, defaults: initialDefaults }: { overview: Overview; defaults: DocumentDefaults }) {
  const [showPhoto, setShowPhoto] = useState(initialDefaults.showPhoto)
  const [language, setLanguage] = useState(overview.defaultLanguage)
  const [pending, startTransition] = useTransition()
  const [busy, setBusy] = useState<string | null>(null)

  const run = (key: string, action: () => Promise<{ ok: boolean; message?: string }>, success?: string) => {
    setBusy(key)
    startTransition(async () => {
      try {
        const result = await action()
        if (!result.ok) toast.error(result.message ?? "Something went wrong")
        else if (result.message || success) toast.success(result.message ?? success)
      } catch {
        toast.error("Could not save or refresh settings. Try again.")
      } finally {
        setBusy(null)
      }
    })
  }

  const savePhotoDefault = (next: boolean) => {
    run("defaults", async () => {
      const result = await saveDocumentPhotoDefaultAction(next)
      if (result.ok) setShowPhoto(next)
      return result
    }, "Defaults saved")
  }

  const missingFonts = overview.fonts.filter((font) => !font.downloaded)

  return (
    <SectionLayout nav={<SectionNav label="Settings sections" items={sections.map(({ id, title, icon: Icon }) => ({ id, label: title, icon: <Icon /> }))} />}>
        <SettingsSection id="ai" title="AI models" description="AI features send relevant job text, verified profile facts, and available company research to the provider you choose.">
            <ModelSettings initial={overview.llm} />
            <DecisionSettings initial={overview.decisions} />
        </SettingsSection>

        <SettingsSection id="documents" title="Documents" description="Defaults for new CVs and letters, and fonts for other writing systems.">
            <Card>
              <CardHeader>
                <CardTitle><h3>Document defaults</h3></CardTitle>
                <CardDescription>Starting preferences for new CVs and cover letters.</CardDescription>
              </CardHeader>
              <CardContent>
                <FieldGroup>
                  <Field orientation="responsive">
                    <FieldContent>
                      <FieldLabel htmlFor="default-language">Default language</FieldLabel>
                      <FieldDescription>Used for new applications and as a fallback for untranslated entries.</FieldDescription>
                    </FieldContent>
                    <Select
                      items={LANGS}
                      value={language}
                      disabled={pending}
                      onValueChange={(value) => {
                        if (!value) return
                        run("language", async () => {
                          const result = await setDefaultLanguageAction(value)
                          if (result.ok) setLanguage(value)
                          return result
                        }, `Default language: ${LANGS.find((item) => item.value === value)?.label}`)
                      }}
                    >
                      <SelectTrigger id="default-language" className="w-full @md/field-group:w-36">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {LANGS.map((item) => (
                          <SelectItem key={item.value} value={item.value}>
                            {item.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                  <FieldSeparator />
                  <Field orientation="responsive">
                    <FieldContent>
                      <FieldTitle>Design</FieldTitle>
                      <FieldDescription>New documents use your default template.</FieldDescription>
                    </FieldContent>
                    <Button variant="outline" className="self-start" nativeButton={false} render={<Link href="/templates" />}>
                      <PaletteIcon /> Open templates
                    </Button>
                  </Field>
                  <FieldSeparator />
                  <Field orientation="responsive">
                    <FieldContent>
                      <FieldLabel htmlFor="show-photo">Show photo</FieldLabel>
                      <FieldDescription>Common in France, Germany and Spain; usually left out in the US, UK and Canada.</FieldDescription>
                    </FieldContent>
                    <Switch className="self-start" id="show-photo" checked={showPhoto} disabled={pending} onCheckedChange={savePhotoDefault} />
                  </Field>
                </FieldGroup>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle><h3 className="flex items-center gap-2"><TypeIcon className="size-4 text-muted-foreground" aria-hidden /> Fonts</h3></CardTitle>
                <CardDescription>Latin, Cyrillic, Greek, Arabic, Hebrew, Devanagari and Thai are included. Chinese, Japanese and Korean download on first use.</CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="divide-y border-y">
                  {overview.fonts.map((font) => (
                    <li key={font.code} className="flex min-h-10 flex-wrap items-center justify-between gap-x-3 gap-y-1 py-2 text-sm">
                      <span>{FONT_NAMES[font.code] ?? font.code}</span>
                      {font.downloaded
                        ? <Badge variant="secondary">Installed · {(font.bytes / 1_048_576).toFixed(1)} MB</Badge>
                        : <span className="text-xs text-muted-foreground">Downloads on first use</span>}
                    </li>
                  ))}
                </ul>
                {missingFonts.length > 0 && (
                  <Button className="mt-3" size="sm" variant="outline" disabled={pending} onClick={() => run("fonts", downloadFontsAction)}>
                    {busy === "fonts" ? <Loader2Icon className="animate-spin motion-reduce:animate-none" /> : <ArrowDownToLineIcon />} Download all fonts
                  </Button>
                )}
              </CardContent>
            </Card>
        </SettingsSection>

        <SettingsSection id="data" title="Data & storage" description="Everything stays on this computer. Export a copy whenever you like.">
          <Card>
            <CardHeader className="flex flex-wrap items-start justify-between gap-3">
              <div className="space-y-1">
                <CardTitle><h3>Your data</h3></CardTitle>
                <CardDescription>Download a copy of your profile, jobs, applications, and documents.</CardDescription>
              </div>
              <Button size="sm" nativeButton={false} render={<a href="/api/export" />}>
                <ArrowDownToLineIcon /> Export JSON
              </Button>
            </CardHeader>
            <CardContent className="grid gap-4">
              <dl className="grid grid-cols-2 gap-x-4 gap-y-3 border-t pt-4 @sm/settings:grid-cols-3 @3xl/settings:grid-cols-6">
                {([
                  ["Profile entries", overview.counts.entries],
                  ["Facts", overview.counts.facts],
                  ["Bullets", overview.counts.phrasings],
                  ["Jobs", overview.counts.jobs],
                  ["Applications", overview.counts.applications],
                  ["Document versions", overview.counts.revisions],
                ] as const).map(([label, value]) => (
                  <div key={label}>
                    <dt className="text-xs text-muted-foreground">{label}</dt>
                    <dd className="font-medium tabular-nums">{value}</dd>
                  </div>
                ))}
              </dl>
              <details className="border-t pt-3">
                <summary className="w-fit cursor-pointer rounded text-sm font-medium focus-visible:outline-2 focus-visible:outline-ring">Storage details</summary>
                <dl className="mt-3 grid gap-2 text-sm">
                  <div className="grid grid-cols-[5rem_minmax(0,1fr)] gap-2"><dt className="text-muted-foreground">Database</dt><dd>{overview.database}</dd></div>
                  <div className="grid grid-cols-[5rem_minmax(0,1fr)] gap-2"><dt className="text-muted-foreground">Files</dt><dd className="break-all font-mono text-xs">{overview.assetsDir}</dd></div>
                  <div className="grid grid-cols-[5rem_minmax(0,1fr)] gap-2"><dt className="text-muted-foreground">Version</dt><dd>{overview.appVersion}</dd></div>
                </dl>
              </details>
            </CardContent>
          </Card>
        </SettingsSection>
    </SectionLayout>
  )
}
