"use client"

import Link from "next/link"
import { useState, useTransition } from "react"
import { ArrowDownToLineIcon, ArrowRightIcon, DatabaseIcon, LanguagesIcon, ExternalLinkIcon, FileTextIcon, HistoryIcon, Loader2Icon, PaletteIcon, SparklesIcon, TypeIcon } from "lucide-react"
import { toast } from "sonner"
import { downloadFontsAction, saveDocumentPhotoDefaultAction, setDefaultLanguageAction } from "@/app/[locale]/(app)/settings/actions"
import { SectionLayout, SectionNav, SettingsSection } from "@/components/section-nav"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldContent, FieldDescription, FieldGroup, FieldLabel, FieldSeparator, FieldTitle } from "@/components/ui/field"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import type { DocumentDefaults, getSystemOverview } from "@/server/settings/service"
import type { getAvailableUpdate, Release } from "@/server/version"
import { useFormatter, useTranslations } from "next-intl"
import { LanguageSwitcher } from "@/components/language-switcher"

type Overview = Awaited<ReturnType<typeof getSystemOverview>>

const LANGS = [
  { value: "en", label: "English" },
  { value: "fr", label: "Français" },
  { value: "es", label: "Español" },
  { value: "de", label: "Deutsch" },
]

const FONT_NAMES = { SC: "SC", JP: "JP", KR: "KR" } as const

const sections = [
  { id: "interface", icon: LanguagesIcon },
  { id: "documents", icon: FileTextIcon },
  { id: "data", icon: DatabaseIcon },
  { id: "version", icon: HistoryIcon },
] as const


export function SettingsView({ overview, defaults: initialDefaults, changelog, update }: { overview: Overview; defaults: DocumentDefaults; changelog: Release[]; update: Awaited<ReturnType<typeof getAvailableUpdate>> }) {
  const [showPhoto, setShowPhoto] = useState(initialDefaults.showPhoto)
  const [language, setLanguage] = useState(overview.defaultLanguage)
  const [pending, startTransition] = useTransition()
  const [busy, setBusy] = useState<string | null>(null)
  const t = useTranslations("settings")
  const format = useFormatter()

  const run = (key: string, action: () => Promise<{ ok: boolean; message?: string }>, success?: string) => {
    setBusy(key)
    startTransition(async () => {
      try {
        const result = await action()
        if (!result.ok) toast.error(result.message ?? t("somethingWrong"))
        else if (result.message || success) toast.success(result.message ?? success)
      } catch {
        toast.error(t("saveFailed"))
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
    }, t("defaultsSaved"))
  }

  const missingFonts = overview.fonts.filter((font) => !font.downloaded)

  return (
    <SectionLayout nav={<SectionNav label={t("sectionsLabel")} items={sections.map(({ id, icon: Icon }) => ({ id, label: t(`sections.${id}.title`), icon: <Icon /> }))} />}>
        <Link href="/integrations#ai" className="group flex items-center gap-3 rounded-xl border bg-muted/20 p-4 transition-colors hover:bg-muted/50 focus-visible:outline-2 focus-visible:outline-ring">
          <SparklesIcon className="size-5 shrink-0 text-brand" />
          <span className="grid min-w-0 flex-1 gap-0.5">
            <span className="text-sm font-medium">{t("aiMoved.title")}</span>
            <span className="text-xs text-muted-foreground">{t("aiMoved.body")}</span>
          </span>
          <ArrowRightIcon className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
        </Link>

        <SettingsSection id="interface" title={t("sections.interface.title")} description={t("sections.interface.description")}>
          <Card>
            <CardContent>
              <Field orientation="responsive">
                <FieldContent>
                  <FieldLabel htmlFor="interface-language">{t("interfaceLanguage")}</FieldLabel>
                  <FieldDescription>{t("interfaceLanguageHint")}</FieldDescription>
                </FieldContent>
                <LanguageSwitcher id="interface-language" />
              </Field>
            </CardContent>
          </Card>
        </SettingsSection>

        <SettingsSection id="documents" title={t("sections.documents.title")} description={t("sections.documents.description")}>
            <Card>
              <CardHeader>
                <CardTitle><h3>{t("defaults.title")}</h3></CardTitle>
                <CardDescription>{t("defaults.description")}</CardDescription>
              </CardHeader>
              <CardContent>
                <FieldGroup>
                  <Field orientation="responsive">
                    <FieldContent>
                      <FieldLabel htmlFor="default-language">{t("defaults.language")}</FieldLabel>
                      <FieldDescription>{t("defaults.languageHint")}</FieldDescription>
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
                        }, t("defaults.languageSaved", { language: LANGS.find((item) => item.value === value)?.label ?? value }))
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
                      <FieldTitle>{t("defaults.design")}</FieldTitle>
                      <FieldDescription>{t("defaults.designHint")}</FieldDescription>
                    </FieldContent>
                    <Button variant="outline" className="self-start" nativeButton={false} render={<Link href="/templates" />}>
                      <PaletteIcon /> {t("defaults.openTemplates")}
                    </Button>
                  </Field>
                  <FieldSeparator />
                  <Field orientation="responsive">
                    <FieldContent>
                      <FieldLabel htmlFor="show-photo">{t("defaults.photo")}</FieldLabel>
                      <FieldDescription>{t("defaults.photoHint")}</FieldDescription>
                    </FieldContent>
                    <Switch className="self-start" id="show-photo" checked={showPhoto} disabled={pending} onCheckedChange={savePhotoDefault} />
                  </Field>
                </FieldGroup>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle><h3 className="flex items-center gap-2"><TypeIcon className="size-4 text-muted-foreground" aria-hidden /> {t("fonts.title")}</h3></CardTitle>
                <CardDescription>{t("fonts.description")}</CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="divide-y border-y">
                  {overview.fonts.map((font) => (
                    <li key={font.code} className="flex min-h-10 flex-wrap items-center justify-between gap-x-3 gap-y-1 py-2 text-sm">
                      <span>{font.code in FONT_NAMES ? t(`fonts.names.${font.code as keyof typeof FONT_NAMES}`) : font.code}</span>
                      {font.downloaded
                        ? <Badge variant="secondary">{t("fonts.installed", { size: format.number(font.bytes / 1_048_576, { maximumFractionDigits: 1, minimumFractionDigits: 1 }) })}</Badge>
                        : <span className="text-xs text-muted-foreground">{t("fonts.onFirstUse")}</span>}
                    </li>
                  ))}
                </ul>
                {missingFonts.length > 0 && (
                  <Button className="mt-3" size="sm" variant="outline" disabled={pending} onClick={() => run("fonts", downloadFontsAction)}>
                    {busy === "fonts" ? <Loader2Icon className="animate-spin motion-reduce:animate-none" /> : <ArrowDownToLineIcon />} {t("fonts.downloadAll")}
                  </Button>
                )}
              </CardContent>
            </Card>
        </SettingsSection>

        <SettingsSection id="data" title={t("sections.data.title")} description={t("sections.data.description")}>
          <Card>
            <CardHeader className="flex flex-wrap items-start justify-between gap-3">
              <div className="space-y-1">
                <CardTitle><h3>{t("data.title")}</h3></CardTitle>
                <CardDescription>{t("data.description")}</CardDescription>
              </div>
              {/* This endpoint returns an attachment and needs a browser download. */}
              <Button size="sm" nativeButton={false} render={<a href="/api/export" download />}>
                <ArrowDownToLineIcon /> {t("data.export")}
              </Button>
            </CardHeader>
            <CardContent className="grid gap-4">
              <dl className="grid grid-cols-2 gap-x-4 gap-y-3 border-t pt-4 @sm/settings:grid-cols-3 @3xl/settings:grid-cols-6">
                {([
                  ["entries", overview.counts.entries],
                  ["facts", overview.counts.facts],
                  ["bullets", overview.counts.phrasings],
                  ["jobs", overview.counts.jobs],
                  ["applications", overview.counts.applications],
                  ["revisions", overview.counts.revisions],
                ] as const).map(([label, value]) => (
                  <div key={label}>
                    <dt className="text-xs text-muted-foreground">{t(`data.counts.${label}`)}</dt>
                    <dd className="font-medium tabular-nums">{format.number(value)}</dd>
                  </div>
                ))}
              </dl>
              <details className="border-t pt-3">
                <summary className="w-fit cursor-pointer rounded text-sm font-medium focus-visible:outline-2 focus-visible:outline-ring">{t("data.storage")}</summary>
                <dl className="mt-3 grid gap-2 text-sm">
                  <div className="grid grid-cols-[5rem_minmax(0,1fr)] gap-2"><dt className="text-muted-foreground">{t("data.database")}</dt><dd>{overview.database}</dd></div>
                  <div className="grid grid-cols-[5rem_minmax(0,1fr)] gap-2"><dt className="text-muted-foreground">{t("data.files")}</dt><dd className="break-all font-mono text-xs">{overview.assetsDir}</dd></div>
                </dl>
              </details>
            </CardContent>
          </Card>
        </SettingsSection>

        <SettingsSection id="version" title={t("sections.version.title")} description={t("sections.version.description")}>
          <Card>
            <CardHeader className="flex flex-wrap items-start justify-between gap-3">
              <div className="space-y-1">
                <CardTitle><h3>Naruvi {overview.appVersion}</h3></CardTitle>
                <CardDescription>{update ? t("version.available", { version: update.version }) : t("version.latest")}</CardDescription>
              </div>
              {update ? <Badge>{t("version.updateBadge")}</Badge> : <Badge variant="secondary">{t("version.upToDate")}</Badge>}
            </CardHeader>
            <CardContent className="grid gap-4">
              {update && (
                <div className="grid gap-2 rounded-lg border bg-muted/30 p-3 text-sm">
                  <p>{t("version.howTo")}</p>
                  <code className="w-fit rounded bg-background px-2 py-1 font-mono text-xs">naruvi update</code>
                  <a href={update.url} target="_blank" rel="noreferrer" className="inline-flex w-fit items-center gap-1 text-xs text-muted-foreground underline-offset-4 hover:underline">
                    {t("version.whatsNew", { version: update.version })} <ExternalLinkIcon className="size-3" aria-hidden />
                  </a>
                </div>
              )}
              {changelog.length > 0 && (
                <div className="grid gap-4 border-t pt-4">
                  <h4 className="text-sm font-medium">{t("version.changelog")}</h4>
                  {changelog.map((release, index) => (
                    <details key={release.version} open={index === 0} className="group">
                      <summary className="w-fit cursor-pointer rounded text-sm focus-visible:outline-2 focus-visible:outline-ring">
                        <span className="font-medium">{release.version}</span>
                        {release.date && <span className="text-muted-foreground"> · {release.date}</span>}
                      </summary>
                      <div className="mt-2 grid gap-3 ps-4">
                        {release.groups.map((group, i) => (
                          <div key={i} className="grid gap-1">
                            {group.title && <p className="text-xs font-medium text-muted-foreground">{group.title}</p>}
                            <ul className="list-disc space-y-1 ps-4 text-sm">
                              {group.items.map((item) => <li key={item}>{item.replace(/[`*]/g, "")}</li>)}
                            </ul>
                          </div>
                        ))}
                      </div>
                    </details>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </SettingsSection>
    </SectionLayout>
  )
}
