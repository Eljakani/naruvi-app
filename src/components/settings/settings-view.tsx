"use client"

import { useState, useTransition } from "react"
import { DownloadIcon, Loader2Icon, PlugZapIcon } from "lucide-react"
import { toast } from "sonner"
import { downloadFontsAction, saveDocumentDefaultsAction, setDefaultLanguageAction, testLlmAction } from "@/app/(app)/settings/actions"
import { DesignPicker } from "@/components/applications/design-picker"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldContent, FieldDescription, FieldGroup, FieldLabel, FieldSeparator, FieldTitle } from "@/components/ui/field"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table"
import type { DocumentDefaults, getSystemOverview } from "@/server/settings/service"

type Overview = Awaited<ReturnType<typeof getSystemOverview>>

const LANGS = [
  { value: "en", label: "English" },
  { value: "fr", label: "Français" },
  { value: "es", label: "Español" },
  { value: "de", label: "Deutsch" },
]

const FONT_NAMES: Record<string, string> = { SC: "Chinese (Simplified)", JP: "Japanese", KR: "Korean" }

export function SettingsView({ overview, defaults: initialDefaults }: { overview: Overview; defaults: DocumentDefaults }) {
  const [defaults, setDefaults] = useState(initialDefaults)
  const [language, setLanguage] = useState(overview.defaultLanguage)
  const [pending, startTransition] = useTransition()
  const [busy, setBusy] = useState<string | null>(null)

  const run = (key: string, action: () => Promise<{ ok: boolean; message?: string }>, success?: string) => {
    setBusy(key)
    startTransition(async () => {
      const result = await action()
      setBusy(null)
      if (!result.ok) toast.error(result.message ?? "Something went wrong")
      else if (result.message || success) toast.success(result.message ?? success)
    })
  }

  const saveDefaults = (next: DocumentDefaults) => {
    setDefaults(next)
    run("defaults", () => saveDocumentDefaultsAction(next), "Defaults saved")
  }

  const missingFonts = overview.fonts.filter((font) => !font.downloaded)

  return (
    <div className="grid max-w-3xl gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Documents</CardTitle>
          <CardDescription>Defaults for new CVs and cover letters. You can still change each document; regenerating keeps its design.</CardDescription>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            <Field orientation="horizontal">
              <FieldContent>
                <FieldLabel htmlFor="default-language">Default language</FieldLabel>
                <FieldDescription>Starting language for new applications, and the fallback when an entry has no wording in a document’s language.</FieldDescription>
              </FieldContent>
              <Select
                items={LANGS}
                value={language}
                disabled={pending}
                onValueChange={(value) => {
                  if (!value) return
                  setLanguage(value)
                  run("language", () => setDefaultLanguageAction(value), `Default language: ${LANGS.find((item) => item.value === value)?.label}`)
                }}
              >
                <SelectTrigger id="default-language" className="w-36">
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
            <Field>
              <FieldContent>
                <FieldTitle>Template and accent</FieldTitle>
                <FieldDescription>Used the first time a CV or letter is generated.</FieldDescription>
              </FieldContent>
              <DesignPicker template={defaults.template} accent={defaults.accent} onChange={(change) => saveDefaults({ ...defaults, ...change })} disabled={pending} />
            </Field>
            <FieldSeparator />
            <Field orientation="horizontal">
              <FieldContent>
                <FieldLabel htmlFor="show-photo">Show photo</FieldLabel>
                <FieldDescription>Common in France, Germany and Spain; usually left out in the US, UK and Canada.</FieldDescription>
              </FieldContent>
              <Switch id="show-photo" checked={defaults.showPhoto} disabled={pending} onCheckedChange={(value) => saveDefaults({ ...defaults, showPhoto: value })} />
            </Field>
          </FieldGroup>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Language model</CardTitle>
          <CardDescription>Optional. CareerBuddy works fully without one; a model only adds a second opinion on uncertain analysis items.</CardDescription>
          <CardAction>
            <Badge variant={overview.llm.configured ? "default" : "secondary"}>{overview.llm.configured ? "Connected" : "Off"}</Badge>
          </CardAction>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            <Table>
              <TableBody>
                <TableRow>
                  <TableCell className="text-muted-foreground">Endpoint</TableCell>
                  <TableCell className="text-right font-mono">{overview.llm.host}</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="text-muted-foreground">Model</TableCell>
                  <TableCell className="text-right font-mono">{overview.llm.model}</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="text-muted-foreground">API key</TableCell>
                  <TableCell className="text-right">{overview.llm.hasKey ? "Set" : "Not set"}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
            <FieldDescription>
              {overview.llm.configured
                ? "Read from .env.local when the app starts. The key is never stored or shown."
                : "To turn it on, set LLM_BASE_URL, LLM_API_KEY and LLM_MODEL in .env.local (any OpenAI-compatible API) and restart."}
            </FieldDescription>
            <Button variant="outline" className="w-fit" disabled={pending || !overview.llm.configured} onClick={() => run("llm", testLlmAction)}>
              {busy === "llm" ? <Loader2Icon className="animate-spin" /> : <PlugZapIcon />} Test connection
            </Button>
          </FieldGroup>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Fonts</CardTitle>
          <CardDescription>Latin, Cyrillic, Greek, Arabic, Hebrew, Devanagari and Thai are included. Chinese, Japanese and Korean download on first use.</CardDescription>
          {missingFonts.length ? (
            <CardAction>
              <Button size="sm" variant="outline" disabled={pending} onClick={() => run("fonts", downloadFontsAction)}>
                {busy === "fonts" ? <Loader2Icon className="animate-spin" /> : <DownloadIcon />} Download all
              </Button>
            </CardAction>
          ) : null}
        </CardHeader>
        <CardContent>
          <Table>
            <TableBody>
              {overview.fonts.map((font) => (
                <TableRow key={font.code}>
                  <TableCell>{FONT_NAMES[font.code] ?? font.code}</TableCell>
                  <TableCell className="text-right">
                    {font.downloaded ? <Badge variant="secondary">{(font.bytes / 1_048_576).toFixed(1)} MB</Badge> : <span className="text-muted-foreground">Downloads when needed</span>}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Your data</CardTitle>
          <CardDescription>Everything is stored on this machine. Export it any time as JSON.</CardDescription>
          <CardAction>
            <Button size="sm" nativeButton={false} render={<a href="/api/export" />}>
              <DownloadIcon /> Export
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent>
          <Table>
            <TableBody>
              {(
                [
                  ["Profile entries", overview.counts.entries],
                  ["Facts", overview.counts.facts],
                  ["Bullets", overview.counts.phrasings],
                  ["Jobs", overview.counts.jobs],
                  ["Applications", overview.counts.applications],
                  ["Document versions", overview.counts.revisions],
                ] as const
              ).map(([label, value]) => (
                <TableRow key={label}>
                  <TableCell className="text-muted-foreground">{label}</TableCell>
                  <TableCell className="text-right tabular-nums">{value}</TableCell>
                </TableRow>
              ))}
              <TableRow>
                <TableCell className="text-muted-foreground">Database</TableCell>
                <TableCell className="text-right">{overview.database}</TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="text-muted-foreground">Files</TableCell>
                <TableCell className="max-w-64 truncate text-right font-mono" title={overview.assetsDir}>
                  {overview.assetsDir}
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="text-muted-foreground">Version</TableCell>
                <TableCell className="text-right">{overview.appVersion}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
