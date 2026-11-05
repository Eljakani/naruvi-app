"use client"

import { useState, useTransition } from "react"
import { CheckCircle2Icon, CircleDashedIcon, DatabaseIcon, DownloadIcon, FileTextIcon, KeyRoundIcon, LanguagesIcon, Loader2Icon, PlugZapIcon, TypeIcon } from "lucide-react"
import { toast } from "sonner"
import { downloadFontsAction, saveDocumentDefaultsAction, setDefaultLanguageAction, testLlmAction } from "@/app/(app)/settings/actions"
import { DesignPicker } from "@/components/applications/design-picker"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Kbd } from "@/components/ui/kbd"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { cn } from "@/lib/utils"
import type { DocumentDefaults, getSystemOverview } from "@/server/settings/service"

type Overview = Awaited<ReturnType<typeof getSystemOverview>>

const LANGS = [
  { code: "en", name: "English" },
  { code: "fr", name: "Français" },
  { code: "es", name: "Español" },
  { code: "de", name: "Deutsch" },
]

function Row({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 py-3 first:pt-0 last:pb-0">
      <div className="min-w-0">
        <div className="text-sm font-medium">{label}</div>
        {hint ? <div className="text-xs text-muted-foreground">{hint}</div> : null}
      </div>
      <div className="flex items-center gap-2">{children}</div>
    </div>
  )
}

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

  return (
    <div className="cb-stagger grid max-w-3xl gap-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <PlugZapIcon className="size-4" /> Language model
          </CardTitle>
          <CardDescription>Optional. CareerBuddy works fully without one; a model only adds a second opinion on uncertain analysis items.</CardDescription>
          <CardAction>
            <Badge variant={overview.llm.configured ? "default" : "secondary"}>{overview.llm.configured ? "Configured" : "Not configured"}</Badge>
          </CardAction>
        </CardHeader>
        <CardContent className="divide-y">
          <Row label="Endpoint" hint="Any OpenAI-compatible API: DeepSeek, OpenAI, Mistral, Ollama…">
            <code className="rounded bg-muted px-2 py-1 font-mono text-xs">{overview.llm.host}</code>
          </Row>
          <Row label="Model">
            <code className="rounded bg-muted px-2 py-1 font-mono text-xs">{overview.llm.model}</code>
          </Row>
          <Row label="API key" hint="Read from .env.local at startup — never stored in the database or shown here.">
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <KeyRoundIcon className="size-3.5" /> {overview.llm.hasKey ? "Set" : "Not set"}
            </span>
          </Row>
          <Row label="Connection">
            <Button size="sm" variant="outline" disabled={pending} onClick={() => run("llm", testLlmAction)}>
              {busy === "llm" ? <Loader2Icon className="animate-spin" /> : <PlugZapIcon />} Test connection
            </Button>
          </Row>
          {!overview.llm.configured ? (
            <div className="pt-3 text-xs text-muted-foreground">
              To enable, add to <Kbd>.env.local</Kbd>:
              <pre className="mt-2 overflow-x-auto rounded-md bg-muted p-3 font-mono text-[11px] leading-5">{`LLM_BASE_URL=https://api.deepseek.com/v1\nLLM_API_KEY=sk-…\nLLM_MODEL=deepseek-chat`}</pre>
              then restart the app.
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileTextIcon className="size-4" /> Documents
          </CardTitle>
          <CardDescription>Defaults for new CVs and cover letters. Each document can still be changed in its Design tab; regenerating keeps its design.</CardDescription>
          {busy === "defaults" ? (
            <CardAction>
              <Loader2Icon className="size-4 animate-spin text-muted-foreground" />
            </CardAction>
          ) : null}
        </CardHeader>
        <CardContent className="grid gap-5">
          <div className="grid gap-2">
            <Label className="flex items-center gap-1.5">
              <LanguagesIcon className="size-3.5" /> Default language
            </Label>
            <div className="flex w-fit rounded-lg bg-muted p-0.5" role="radiogroup" aria-label="Default language">
              {LANGS.map((item) => (
                <button
                  key={item.code}
                  type="button"
                  role="radio"
                  aria-checked={language === item.code}
                  disabled={pending}
                  onClick={() => {
                    setLanguage(item.code)
                    run("language", () => setDefaultLanguageAction(item.code), `Default language: ${item.name}`)
                  }}
                  className={cn("rounded-md px-3 py-1 text-sm transition-colors", language === item.code ? "bg-background font-medium shadow-xs" : "text-muted-foreground hover:text-foreground")}
                >
                  {item.name}
                </button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">Used when a profile entry has no wording in the document’s language, and as the starting language for new applications.</p>
          </div>
          <div className="grid gap-2">
            <Label>Default template</Label>
            <DesignPicker template={defaults.template} accent={defaults.accent} onChange={(change) => saveDefaults({ ...defaults, ...change })} disabled={pending} />
          </div>
          <div className="flex items-center justify-between gap-4 rounded-lg border p-3">
            <div>
              <div className="text-sm font-medium">Show photo by default</div>
              <div className="text-xs text-muted-foreground">Common in France, Germany and Spain; usually left out in the US, UK and Canada.</div>
            </div>
            <Switch checked={defaults.showPhoto} disabled={pending} onCheckedChange={(value) => saveDefaults({ ...defaults, showPhoto: value })} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TypeIcon className="size-4" /> Fonts
          </CardTitle>
          <CardDescription>Latin, Cyrillic, Greek, Arabic, Hebrew, Devanagari and Thai are bundled. Chinese, Japanese and Korean download on first use (~4–8 MB each).</CardDescription>
        </CardHeader>
        <CardContent className="divide-y">
          {overview.fonts.map((font) => (
            <Row key={font.code} label={{ SC: "Chinese (Simplified)", JP: "Japanese", KR: "Korean" }[font.code] ?? font.code}>
              {font.downloaded ? (
                <span className="flex items-center gap-1.5 text-xs text-emerald-600">
                  <CheckCircle2Icon className="size-3.5" /> Ready · {(font.bytes / 1_048_576).toFixed(1)} MB
                </span>
              ) : (
                <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <CircleDashedIcon className="size-3.5" /> Downloads when needed
                </span>
              )}
            </Row>
          ))}
          {overview.fonts.some((font) => !font.downloaded) ? (
            <div className="pt-3">
              <Button size="sm" variant="outline" disabled={pending} onClick={() => run("fonts", downloadFontsAction)}>
                {busy === "fonts" ? <Loader2Icon className="animate-spin" /> : <DownloadIcon />} Download now for offline use
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <DatabaseIcon className="size-4" /> Your data
          </CardTitle>
          <CardDescription>Stored locally in PostgreSQL and the asset folder. Export it any time.</CardDescription>
          <CardAction>
            <Button size="sm" nativeButton={false} render={<a href="/api/export" />}>
              <DownloadIcon /> Export JSON
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent className="grid gap-4">
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {(
              [
                ["Entries", overview.counts.entries],
                ["Facts", overview.counts.facts],
                ["Bullets", overview.counts.phrasings],
                ["Jobs", overview.counts.jobs],
                ["Applications", overview.counts.applications],
                ["Document versions", overview.counts.revisions],
              ] as const
            ).map(([label, value]) => (
              <div key={label} className="rounded-lg bg-muted/50 px-3 py-2">
                <dt className="text-xs text-muted-foreground">{label}</dt>
                <dd className="text-lg font-semibold tabular-nums">{value}</dd>
              </div>
            ))}
          </dl>
          <div className="divide-y border-t pt-1">
            <Row label="Database">
              <span className="text-xs text-muted-foreground">{overview.database}</span>
            </Row>
            <Row label="Files (logos, photos, fonts)">
              <code className="max-w-72 truncate rounded bg-muted px-2 py-1 font-mono text-xs" title={overview.assetsDir}>
                {overview.assetsDir}
              </code>
            </Row>
            <Row label="Version">
              <span className="text-xs text-muted-foreground">CareerBuddy {overview.appVersion}</span>
            </Row>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
