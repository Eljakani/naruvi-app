"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { startTransition, useEffect, useId, useRef, useState, useTransition } from "react"
import { ArrowLeftIcon, BanIcon, CheckCircle2Icon, CircleDashedIcon, CopyIcon, EllipsisIcon, EyeIcon, FileTextIcon, HistoryIcon, RotateCcwIcon, SaveIcon, ShieldCheckIcon, SparklesIcon, StarIcon, Trash2Icon, XIcon } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { toast } from "sonner"
import type { AgentResult } from "@/server/templates/design-agent"
import { aiDesignAction, deleteTemplateAction, restoreTemplateVersionAction, saveTemplateAction, setDefaultDesignAction, templateVersionsAction } from "@/app/(app)/templates/actions"
import { PdfThumb } from "@/components/templates/pdf-thumb"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import type { TemplateVersion } from "@/server/templates/service"
import { AiSteps, useStep } from "@/components/ai-progress"
import { PdfPreview } from "@/components/documents/pdf-preview"
import { Button } from "@/components/ui/button"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Field, FieldContent, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Slider } from "@/components/ui/slider"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { designTokens, FONTS, PRESETS, type DesignTokens } from "@/lib/design"
import { cn } from "@/lib/utils"
import { mergeDesignChanges } from "@/lib/template-edit"

const ACCENTS = ["#2563eb", "#0f766e", "#4338ca", "#7c3aed", "#be123c", "#c2410c", "#1e3a5f", "#111827"]
const IDEAS = ["Make it fit on one page", "More elegant and minimal", "Use a dark green accent", "Bigger name, centred header", "Two columns with skills on the side"]
const DESIGN_STEPS = ["Planning the change", "Rendering your CV", "Measuring pages and readability", "Fixing what didn’t pass", "Final check against your request"]

type Initial = { id?: string; name: string; basedOn: string; tokens: DesignTokens; customDefault?: boolean }

/** One line: what happened, with an icon. Rejections say why in a sentence and change nothing. */
function AgentStatus({ result, onDismiss }: { result: AgentResult; onDismiss: () => void }) {
  const applied = result.outcome === "applied"
  const Icon = applied ? CheckCircle2Icon : result.outcome === "unchanged" ? CircleDashedIcon : BanIcon
  return (
    <div role="status" className="cb-step flex items-start gap-2 rounded-lg bg-background px-2.5 py-2 text-xs">
      <Icon key={result.outcome} className={cn("cb-pop mt-px size-4 shrink-0", applied ? "text-primary" : "text-muted-foreground")} />
      <div className="grid min-w-0 flex-1 gap-1">
        <span className="font-medium">{applied ? result.summary : result.outcome === "unchanged" ? "Already looks like that" : "Can’t do that one"}</span>
        {applied ? (
          <span className="flex flex-wrap gap-1 text-muted-foreground">
            <Badge variant="secondary" className="gap-1"><ShieldCheckIcon className="size-3" /> Verified</Badge>
            <Badge variant="secondary" className="gap-1"><FileTextIcon className="size-3" /> {result.pages} page{result.pages === 1 ? "" : "s"}</Badge>
            <Badge variant="secondary">{result.changed.length} setting{result.changed.length === 1 ? "" : "s"}</Badge>
          </span>
        ) : result.reason ? (
          <span className="text-muted-foreground">{result.reason} Nothing was changed.</span>
        ) : null}
      </div>
      <button type="button" onClick={onDismiss} aria-label="Dismiss" className="rounded p-0.5 text-muted-foreground hover:text-foreground">
        <XIcon className="size-3.5" />
      </button>
    </div>
  )
}

/** Keys the AI just changed glow briefly, so you can see what moved. */
const Flash = ({ on, children }: { on: boolean; children: React.ReactNode }) => <div className={cn("-mx-2 rounded-lg px-2 py-1 transition-colors duration-700", on ? "bg-primary/10" : "bg-transparent")}>{children}</div>

function Choice<T extends string>({ value, options, onChange, label }: { value: T; options: { value: T; label: string }[]; onChange: (value: T) => void; label: string }) {
  return (
    <ToggleGroup value={[value]} onValueChange={(next) => next[0] && onChange(next[0] as T)} variant="outline" size="sm" aria-label={label} className="flex-wrap justify-start">
      {options.map((option) => (
        <ToggleGroupItem key={option.value} value={option.value}>
          {option.label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  )
}

function Range({ label, value, min, max, step, unit = "", onChange }: { label: string; value: number; min: number; max: number; step: number; unit?: string; onChange: (value: number) => void }) {
  return (
    <Field>
      <div className="flex items-center justify-between">
        <FieldLabel>{label}</FieldLabel>
        <span className="text-xs text-muted-foreground tabular-nums">
          {Number.isInteger(step) ? value : value.toFixed(step < 0.1 ? 2 : 1)}
          {unit}
        </span>
      </div>
      <Slider value={[value]} min={min} max={max} step={step} onValueChange={(next) => onChange(Array.isArray(next) ? next[0] : next)} aria-label={label} />
    </Field>
  )
}

function Toggle({ label, hint, checked, onChange }: { label: string; hint?: string; checked: boolean; onChange: (value: boolean) => void }) {
  const id = useId()
  return (
    <Field orientation="horizontal">
      <FieldContent>
        <FieldLabel id={id}>{label}</FieldLabel>
        {hint ? <FieldDescription>{hint}</FieldDescription> : null}
      </FieldContent>
      <Switch aria-labelledby={id} checked={checked} onCheckedChange={onChange} />
    </Field>
  )
}

/** Visual template editor: controls, AI prompt, live preview with your own CV. */
export function TemplateEditor({ initial }: { initial: Initial }) {
  const router = useRouter()
  const [baseline] = useState({ name: initial.name, tokens: initial.tokens })
  const [name, setName] = useState(initial.name)
  const [tokens, setTokens] = useState(initial.tokens)
  const [saved, setSaved] = useState(baseline)
  const [draftReady, setDraftReady] = useState(false)
  const [prompt, setPrompt] = useState("")
  const [preview, setPreview] = useState<{ url: string; pages: number; key: string; attempt: number }>()
  const [previewError, setPreviewError] = useState<{ key: string; attempt: number }>()
  const [attempt, setAttempt] = useState(0)
  const [fitGoal, setFitGoal] = useState(false)
  const [agentLog, setAgentLog] = useState<AgentResult | null>(null)
  const [mobilePreview, setMobilePreview] = useState(false)
  const [asking, startAsking] = useTransition()
  const [saving, startSaving] = useTransition()
  const step = useStep(asking, DESIGN_STEPS.length)
  const [flash, setFlash] = useState<Set<string>>(new Set())
  const [panel, setPanel] = useState("design")
  const [versions, setVersions] = useState<TemplateVersion[] | null>(null)
  const [historyError, setHistoryError] = useState(false)
  const [historyLoading, setHistoryLoading] = useState(false)
  const [lastPrompt, setLastPrompt] = useState("")
  const [confirmation, setConfirmation] = useState<"delete" | TemplateVersion | null>(null)
  const promptLabel = useId()
  const fontLabel = useId()
  const headingFontLabel = useId()
  const previous = useRef<string | null>(null)
  const flashTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const active = useRef(false)
  const glow = (...keys: (keyof DesignTokens)[]) => keys.some((key) => flash.has(key))
  const draftKey = `naruvi:template-draft:v1:${initial.id ?? `new:${initial.customDefault ? "default" : initial.basedOn}`}`
  const savedKey = JSON.stringify(saved)
  const dirty = JSON.stringify({ name, tokens }) !== savedKey
  const tokenKey = JSON.stringify(tokens)
  const failed = previewError?.key === tokenKey && previewError.attempt === attempt
  const rendering = !failed && (preview?.key !== tokenKey || preview.attempt !== attempt)
  const busy = asking || saving || !draftReady
  const set = <K extends keyof DesignTokens>(key: K, value: DesignTokens[K]) => setTokens((current) => ({ ...current, [key]: value }))

  useEffect(() => {
    let draft: { name: string; tokens: DesignTokens; note: string } | undefined
    try {
      const stored = JSON.parse(localStorage.getItem(draftKey) ?? "null")
      if (stored?.base === JSON.stringify(baseline) && typeof stored.name === "string") {
        const parsed = designTokens.safeParse(stored.tokens)
        if (parsed.success) draft = { name: stored.name.slice(0, 80), tokens: parsed.data, note: typeof stored.note === "string" ? stored.note.slice(0, 500) : "" }
      }
    } catch { /* Storage can be unavailable in private browsing. */ }
    startTransition(() => {
      if (draft) {
        setName(draft.name)
        setTokens(draft.tokens)
        setLastPrompt(draft.note)
      }
      setDraftReady(true)
    })
  }, [baseline, draftKey])

  useEffect(() => {
    if (!draftReady) return
    const persist = () => {
      if (dirty) localStorage.setItem(draftKey, JSON.stringify({ base: savedKey, name, tokens, note: lastPrompt }))
      else localStorage.removeItem(draftKey)
    }
    try { persist() } catch { /* Warn on unload if persistence fails. */ }
    if (!dirty) return
    const beforeUnload = (event: BeforeUnloadEvent) => {
      try { persist() } catch { event.preventDefault(); event.returnValue = "" }
    }
    window.addEventListener("beforeunload", beforeUnload)
    return () => window.removeEventListener("beforeunload", beforeUnload)
  }, [draftReady, dirty, draftKey, savedKey, name, tokens, lastPrompt])

  useEffect(() => {
    active.current = true
    return () => {
      active.current = false
      if (previous.current) URL.revokeObjectURL(previous.current)
      previous.current = null
      clearTimeout(flashTimer.current)
    }
  }, [])

  // A superseded render can never replace the current preview.
  useEffect(() => {
    if (!draftReady) return
    const controller = new AbortController()
    let cancelled = false
    const timer = setTimeout(async () => {
      const timeout = setTimeout(() => controller.abort(), 30_000)
      try {
        const response = await fetch("/api/templates/preview", { method: "POST", headers: { "content-type": "application/json" }, body: `{"tokens":${tokenKey}}`, signal: controller.signal })
        if (!response.ok || !response.headers.get("content-type")?.startsWith("application/pdf")) throw new Error("Preview request failed")
        const blob = await response.blob()
        if (cancelled) return
        const url = URL.createObjectURL(blob)
        if (previous.current) URL.revokeObjectURL(previous.current)
        previous.current = url
        setPreview({ url, key: tokenKey, pages: Number(response.headers.get("x-pages")), attempt })
        setPreviewError(undefined)
      } catch {
        if (!cancelled) setPreviewError({ key: tokenKey, attempt })
      } finally {
        clearTimeout(timeout)
      }
    }, 350)
    return () => {
      cancelled = true
      clearTimeout(timer)
      controller.abort()
    }
  }, [tokenKey, attempt, draftReady])

  const ask = (text = prompt) => {
    if (busy || text.trim().length < 3) return
    startAsking(async () => {
      try {
        const result = await aiDesignAction({ tokens, prompt: text })
        if (!active.current) return
        if (!result.ok) return void toast.error(result.message)
        setAgentLog(result.data)
        setFitGoal(false)
        // Only a fully verified design is applied; a rejected request leaves the design untouched.
        if (result.data.outcome !== "applied") return
        const changes = Object.fromEntries(result.data.changed.map((key) => [key, result.data.tokens[key as keyof DesignTokens]])) as Partial<DesignTokens>
        setTokens((current) => mergeDesignChanges(tokens, current, changes))
        setLastPrompt(text)
        setPrompt("")
        setFlash(new Set(result.data.changed))
        clearTimeout(flashTimer.current)
        flashTimer.current = setTimeout(() => setFlash(new Set()), 1600)
      } catch {
        if (active.current) toast.error("Couldn’t apply the design request. Try again.")
      }
    })
  }

  const save = (asCopy = false) =>
    startSaving(async () => {
      try {
        const cleanName = name.trim()
        const result = await saveTemplateAction({ id: asCopy ? undefined : initial.id, name: asCopy && cleanName ? `${cleanName.slice(0, 73)} (copy)` : cleanName, basedOn: initial.basedOn, tokens, note: lastPrompt ? `AI: ${lastPrompt}`.slice(0, 200) : undefined })
        if (!active.current) return
        if (!result.ok) return void toast.error(result.message)
        setLastPrompt("")
        setVersions(null)
        setName(cleanName)
        setSaved({ name: cleanName, tokens })
        toast.success(asCopy ? "Saved as a new template" : "Template saved", { description: "Pick it in any CV or letter, under Look." })
        if (!initial.id || asCopy) router.replace(`/templates/${result.data.id}`)
      } catch {
        if (active.current) toast.error("Couldn’t save the template. Your edits are still here.")
      }
    })

  const remove = () =>
    startSaving(async () => {
      if (!initial.id) return
      try {
        const result = await deleteTemplateAction(initial.id)
        if (!result.ok) return void toast.error(result.message)
        try { localStorage.removeItem(draftKey) } catch { /* Nothing to clear. */ }
        setConfirmation(null)
        toast.success("Template deleted")
        router.replace("/templates")
      } catch {
        toast.error("Couldn’t delete the template. Try again.")
      }
    })

  const makeDefault = () =>
    startSaving(async () => {
      try {
        const presetTokens = PRESETS[initial.basedOn]?.tokens
        const untouchedPreset = !initial.id && !initial.customDefault && presetTokens && JSON.stringify({ ...tokens, accent: presetTokens.accent }) === JSON.stringify(presetTokens)
        const matchesSavedDesign = JSON.stringify(tokens) === JSON.stringify(saved.tokens)
        const result = await setDefaultDesignAction({ templateRef: initial.id && matchesSavedDesign ? initial.id : undefined, preset: untouchedPreset ? initial.basedOn : undefined, tokens })
        if (!result.ok) return void toast.error(result.message)
        toast.success("Set as your default design", { description: "New CVs and letters will start with it. Existing ones keep their look." })
      } catch {
        toast.error("Couldn’t update the default design. Try again.")
      }
    })

  const loadHistory = async () => {
    if (!initial.id || historyLoading) return
    setHistoryLoading(true)
    setHistoryError(false)
    try {
      const result = await templateVersionsAction(initial.id)
      if (result.ok) setVersions(result.data)
      else setHistoryError(true)
    } catch {
      setHistoryError(true)
    } finally {
      setHistoryLoading(false)
    }
  }
  const restore = (version: TemplateVersion) =>
    startSaving(async () => {
      if (!initial.id) return
      try {
        const result = await restoreTemplateVersionAction(initial.id, version.id)
        if (!result.ok) return void toast.error(result.message)
        setName(result.data.name)
        setTokens(result.data.tokens)
        setSaved(result.data)
        setLastPrompt("")
        setFitGoal(false)
        setVersions(null)
        setConfirmation(null)
        setPanel("design")
        toast.success("Version restored", { description: "The name and design were saved as a new version." })
      } catch {
        toast.error("Couldn’t restore the version. Try again.")
      }
    })

  const fontOptions = Object.entries(FONTS).map(([value, font]) => ({ value, label: font.name }))

  return (
    <div className="-mx-4 -mt-4 flex h-[calc(100svh-3.5rem)] min-w-0 flex-col md:-mx-6 md:-mt-6">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b bg-background px-4 py-2.5 md:px-6">
        <div className="flex min-w-0 basis-full items-center gap-2 sm:flex-1 sm:basis-auto">
          <Button variant="ghost" size="icon-sm" className="shrink-0" aria-label="Back to templates" nativeButton={false} render={<Link href="/templates" />}><ArrowLeftIcon /></Button>
          <Input value={name} maxLength={80} disabled={saving || !draftReady} onChange={(event) => setName(event.target.value)} aria-label="Template name" className="h-9 min-w-0 flex-1 font-medium sm:max-w-64" />
          <span className="hidden text-xs text-muted-foreground xl:inline">{initial.customDefault ? "Custom default" : `Based on ${PRESETS[initial.basedOn]?.name ?? "Classic"}`}</span>
        </div>
        <div className="flex min-w-0 flex-wrap items-center gap-2 sm:ml-auto">
          <Button size="sm" variant="outline" className="h-10 lg:hidden" onClick={() => setMobilePreview((value) => !value)} aria-pressed={mobilePreview}><EyeIcon /> Preview</Button>
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button size="icon-sm" variant="outline" className="size-10 lg:size-8" aria-label="Template actions" disabled={busy} />}><EllipsisIcon /></DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem onClick={makeDefault}><StarIcon /> Use as default</DropdownMenuItem>
              <DropdownMenuItem onClick={() => setTokens(PRESETS[initial.basedOn]?.tokens ?? PRESETS.classic.tokens)}><RotateCcwIcon /> Reset to preset</DropdownMenuItem>
              {dirty ? <DropdownMenuItem onClick={() => { setName(saved.name); setTokens(saved.tokens); setLastPrompt(""); setFitGoal(false) }}>Discard unsaved edits</DropdownMenuItem> : null}
              {initial.id ? <>
                <DropdownMenuItem onClick={() => save(true)}><CopyIcon /> Save as copy</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" onClick={() => setConfirmation("delete")}><Trash2Icon /> Delete template</DropdownMenuItem>
              </> : null}
            </DropdownMenuContent>
          </DropdownMenu>
          <Button size="sm" className="h-10 lg:h-8" onClick={() => save()} disabled={busy || (!dirty && Boolean(initial.id))}>
            <SaveIcon /> {initial.id ? (dirty ? "Save changes" : "Saved") : "Save template"}
          </Button>
        </div>
        {dirty ? <p className="basis-full text-xs text-muted-foreground" role="status">Unsaved changes</p> : null}
      </div>

      <div className="grid min-h-0 min-w-0 flex-1 grid-cols-[minmax(0,1fr)] lg:grid-cols-[minmax(0,400px)_minmax(0,1fr)]">
        <Tabs value={panel} onValueChange={(value) => { setPanel(value); if (value === "history" && !versions) void loadHistory() }} className={cn("min-h-0 min-w-0 flex-col gap-0 bg-background lg:flex lg:border-r", mobilePreview ? "hidden" : "flex")}>
          <TabsList variant="line" className="w-full justify-start gap-1 border-b px-3">
            <TabsTrigger value="design">Design</TabsTrigger>
            <TabsTrigger value="history" disabled={!initial.id} className="gap-1.5"><HistoryIcon className="size-3.5" /> History</TabsTrigger>
          </TabsList>
          <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto">
            <TabsContent value="design" className="grid gap-4 p-4">
              <div className="grid gap-2 rounded-xl border bg-muted/30 p-3">
                <div id={promptLabel} className="flex items-center gap-2 text-sm font-medium">
                  <SparklesIcon className={cn("size-4", asking && "cb-breathe")} /> Describe what you want
                </div>
                <Textarea aria-labelledby={promptLabel} maxLength={500} value={prompt} onChange={(event) => setPrompt(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && (event.metaKey || event.ctrlKey) && prompt.trim()) ask() }} placeholder="e.g. Make it look more premium, with a navy accent and a bit more space" className="min-h-16 bg-background text-base sm:text-sm" disabled={busy} />
                {asking ? (
                  <AiSteps steps={DESIGN_STEPS} step={step} />
                ) : (
                  <div className="cb-stagger flex flex-wrap items-center gap-1.5">
                    {IDEAS.map((idea) => (
                      <Button key={idea} size="xs" variant="outline" onClick={() => ask(idea)} disabled={busy} className="bg-background text-muted-foreground">
                        {idea}
                      </Button>
                    ))}
                    <Button size="sm" className="ml-auto" onClick={() => ask()} disabled={busy || prompt.trim().length < 3}>
                      <SparklesIcon /> Apply
                    </Button>
                  </div>
                )}
                {agentLog && !asking ? <AgentStatus result={agentLog} onDismiss={() => setAgentLog(null)} /> : null}
                {fitGoal ? <p role="status" className="text-xs text-muted-foreground">{failed ? "Couldn’t verify page fit. Retry the preview." : rendering ? "Checking page count…" : preview?.pages === 1 ? "Verified: the preview fits on one page." : `The preview still needs ${preview?.pages || "multiple"} pages. No content was removed.`}</p> : null}
              </div>

              <fieldset disabled={saving || !draftReady} className="contents">
              <Accordion multiple defaultValue={["type", "colour", "layout"]} className="grid">
                <AccordionItem value="type">
                  <AccordionTrigger>Typography</AccordionTrigger>
                  <AccordionContent>
                    <FieldGroup className="gap-4 pt-1">
                      <Flash on={glow("font", "headingFont")}>
                        <div className="grid grid-cols-2 gap-3">
                          <Field>
                            <FieldLabel id={fontLabel}>Text font</FieldLabel>
                            <Select items={fontOptions} value={tokens.font} onValueChange={(value) => value && set("font", value as DesignTokens["font"])}>
                              <SelectTrigger aria-labelledby={fontLabel} className="w-full min-w-0"><SelectValue /></SelectTrigger>
                              <SelectContent>{fontOptions.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent>
                            </Select>
                          </Field>
                          <Field>
                            <FieldLabel id={headingFontLabel}>Heading font</FieldLabel>
                            <Select items={[{ value: "same", label: "Same as text" }, ...fontOptions]} value={tokens.headingFont} onValueChange={(value) => value && set("headingFont", value)}>
                              <SelectTrigger aria-labelledby={headingFontLabel} className="w-full min-w-0"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="same">Same as text</SelectItem>
                                {fontOptions.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
                              </SelectContent>
                            </Select>
                          </Field>
                        </div>
                      </Flash>
                      <Flash on={glow("size")}><Range label="Text size" value={tokens.size} min={8} max={11.5} step={0.1} unit=" pt" onChange={(value) => set("size", value)} /></Flash>
                      <Flash on={glow("nameSize")}><Range label="Name size" value={tokens.nameSize} min={14} max={32} step={1} unit=" pt" onChange={(value) => set("nameSize", value)} /></Flash>
                      <Flash on={glow("lineHeight")}><Range label="Line height" value={tokens.lineHeight} min={1.15} max={1.7} step={0.01} onChange={(value) => set("lineHeight", value)} /></Flash>
                    </FieldGroup>
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="colour">
                  <AccordionTrigger>Colour</AccordionTrigger>
                  <AccordionContent>
                    <FieldGroup className="gap-3 pt-1">
                      <Flash on={glow("accent")}>
                        <div className="flex flex-wrap items-center gap-2">
                          {ACCENTS.map((color) => (
                            <button key={color} type="button" onClick={() => set("accent", color)} aria-label={`Accent ${color}`} aria-pressed={tokens.accent === color} className={cn("size-7 rounded-full ring-offset-2 ring-offset-background transition-[box-shadow,transform] duration-150 active:scale-95", tokens.accent === color && "ring-2 ring-foreground")} style={{ backgroundColor: color }} />
                          ))}
                          <label className="relative size-7 cursor-pointer overflow-hidden rounded-full border" title="Any colour">
                            <input type="color" value={tokens.accent} onChange={(event) => set("accent", event.target.value)} className="absolute -inset-2 size-12 cursor-pointer" aria-label="Custom accent colour" />
                          </label>
                        </div>
                      </Flash>
                      <Flash on={glow("accentName")}><Toggle label="Name in accent" checked={tokens.accentName} onChange={(value) => set("accentName", value)} /></Flash>
                      <Flash on={glow("accentHeadings")}><Toggle label="Headings in accent" checked={tokens.accentHeadings} onChange={(value) => set("accentHeadings", value)} /></Flash>
                      <Flash on={glow("accentBullets")}><Toggle label="Bullets in accent" checked={tokens.accentBullets} onChange={(value) => set("accentBullets", value)} /></Flash>
                    </FieldGroup>
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="layout">
                  <AccordionTrigger>Layout</AccordionTrigger>
                  <AccordionContent>
                    <FieldGroup className="gap-4 pt-1">
                      <Flash on={glow("layout")}>
                        <Field>
                          <FieldLabel>Columns</FieldLabel>
                          <Choice label="Columns" value={tokens.layout} onChange={(value) => set("layout", value)} options={[{ value: "single", label: "One column" }, { value: "sidebar", label: "Side column" }]} />
                          {tokens.layout === "sidebar" ? <FieldDescription>Skills, languages and certifications move to a side column.</FieldDescription> : null}
                        </Field>
                      </Flash>
                      <Flash on={glow("headerAlign")}>
                        <Field>
                          <FieldLabel>Header</FieldLabel>
                          <Choice label="Header alignment" value={tokens.headerAlign} onChange={(value) => set("headerAlign", value)} options={[{ value: "left", label: "Left" }, { value: "center", label: "Centred" }]} />
                        </Field>
                      </Flash>
                      <Flash on={glow("headerBand")}><Toggle label="Coloured header band" checked={tokens.headerBand} onChange={(value) => set("headerBand", value)} /></Flash>
                      <Flash on={glow("margin")}><Range label="Page margins" value={tokens.margin} min={20} max={60} step={1} unit=" pt" onChange={(value) => set("margin", value)} /></Flash>
                      <Flash on={glow("spacing")}><Range label="Spacing between parts" value={tokens.spacing} min={0.6} max={1.6} step={0.05} unit="×" onChange={(value) => set("spacing", value)} /></Flash>
                    </FieldGroup>
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="headings">
                  <AccordionTrigger>Section headings</AccordionTrigger>
                  <AccordionContent>
                    <FieldGroup className="gap-3 pt-1">
                      <Flash on={glow("headingStyle")}><Choice label="Heading style" value={tokens.headingStyle} onChange={(value) => set("headingStyle", value)} options={[{ value: "rule", label: "Line" }, { value: "underline-accent", label: "Accent line" }, { value: "bar", label: "Side bar" }, { value: "filled", label: "Filled" }, { value: "plain", label: "Plain" }]} /></Flash>
                      <Flash on={glow("headingCase")}><Choice label="Heading case" value={tokens.headingCase} onChange={(value) => set("headingCase", value)} options={[{ value: "upper", label: "UPPERCASE" }, { value: "none", label: "Normal" }]} /></Flash>
                    </FieldGroup>
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="details">
                  <AccordionTrigger>Details</AccordionTrigger>
                  <AccordionContent>
                    <FieldGroup className="gap-4 pt-1">
                      <Flash on={glow("bullet")}>
                        <Field>
                          <FieldLabel>Bullets</FieldLabel>
                          <Choice label="Bullet style" value={tokens.bullet} onChange={(value) => set("bullet", value)} options={[{ value: "dot", label: "•" }, { value: "dash", label: "–" }, { value: "arrow", label: "›" }, { value: "square", label: "▪" }, { value: "none", label: "None" }]} />
                        </Field>
                      </Flash>
                      <Flash on={glow("datePosition")}>
                        <Field>
                          <FieldLabel>Dates</FieldLabel>
                          <Choice label="Date position" value={tokens.datePosition} onChange={(value) => set("datePosition", value)} options={[{ value: "right", label: "On the right" }, { value: "below", label: "Under the title" }]} />
                        </Field>
                      </Flash>
                      <Flash on={glow("photoShape")}>
                        <Field>
                          <FieldLabel>Photo shape</FieldLabel>
                          <Choice label="Photo shape" value={tokens.photoShape} onChange={(value) => set("photoShape", value)} options={[{ value: "circle", label: "Circle" }, { value: "rounded", label: "Rounded" }, { value: "square", label: "Square" }]} />
                        </Field>
                      </Flash>
                      <Flash on={glow("showLogos")}><Toggle label="Company logos" checked={tokens.showLogos} onChange={(value) => set("showLogos", value)} /></Flash>
                      <Flash on={glow("orgItalic")}><Toggle label="Company names in italics" checked={tokens.orgItalic} onChange={(value) => set("orgItalic", value)} /></Flash>
                    </FieldGroup>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
              </fieldset>
            </TabsContent>

            <TabsContent value="history" className="grid gap-2 p-4">
              <p className="text-xs text-muted-foreground">Showing up to 50 recent versions. Restoring a name and design creates a new version.</p>
              {historyError ? (
                <div role="status" className="flex flex-wrap items-center gap-2 text-sm">Couldn’t load history. <Button size="sm" variant="outline" onClick={() => void loadHistory()}>Retry</Button></div>
              ) : !versions ? (
                <p role="status" className="text-sm text-muted-foreground">Loading versions…</p>
              ) : versions.length === 0 ? (
                <p className="text-sm text-muted-foreground">No saved versions yet.</p>
              ) : (
                <ol className="cb-stagger grid gap-2">
                  {versions.map((version, index) => (
                    <li key={version.id} className="flex items-center gap-3 rounded-lg border p-2">
                      <PdfThumb tokens={version.tokens} className="w-14 shrink-0" />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium">{version.name}</div>
                        <div className="text-xs text-muted-foreground">{index === 0 ? "Latest save" : new Date(version.createdAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}</div>
                        <div className="truncate text-xs text-muted-foreground">{version.note.startsWith("restored") ? "Restored an earlier version" : version.note === "created" ? "Created" : version.note === "saved" ? "Saved" : version.note}</div>
                      </div>
                      {index > 0 ? (
                        <Button size="xs" variant="outline" onClick={() => dirty ? setConfirmation(version) : restore(version)} disabled={busy}>
                          Restore
                        </Button>
                      ) : null}
                    </li>
                  ))}
                </ol>
              )}
            </TabsContent>
          </div>
        </Tabs>
        <div className={cn("min-h-0 min-w-0 flex-col gap-2 p-3 sm:p-4 lg:flex", mobilePreview ? "flex" : "hidden")}>
          <p className="text-xs text-muted-foreground" role="status">Preview with your latest CV. {rendering ? "Updating…" : ""}</p>
          {failed ? <div role="status" className="flex flex-wrap items-center gap-2 text-sm">
            <p>{preview ? "Couldn’t update the preview. Showing the previous design." : "Couldn’t render the preview."}</p>
            <Button size="sm" variant="outline" onClick={() => setAttempt((value) => value + 1)}>Retry preview</Button>
          </div> : null}
          {preview ? <PdfPreview url={preview.url} busy={rendering} onRetry={failed || rendering ? undefined : () => setAttempt((value) => value + 1)} className="flex-1" /> : !failed ? <div className="flex-1 animate-pulse rounded-xl bg-muted" /> : null}
        </div>
      </div>
      <AlertDialog open={confirmation !== null} onOpenChange={(open) => { if (!open && !saving) setConfirmation(null) }}>
        <AlertDialogContent className="max-w-[calc(100%-2rem)]">
          <AlertDialogHeader>
            <AlertDialogTitle>{confirmation === "delete" ? "Delete template?" : "Restore this version?"}</AlertDialogTitle>
            <AlertDialogDescription>{confirmation === "delete" ? `“${saved.name}” and its version history will be permanently deleted. Existing documents keep their design.` : "This replaces your unsaved edits with the selected version’s name and design."}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving}>Cancel</AlertDialogCancel>
            <AlertDialogAction disabled={saving} variant={confirmation === "delete" ? "destructive" : "default"} onClick={() => confirmation === "delete" ? remove() : confirmation && restore(confirmation)}>{confirmation === "delete" ? "Delete template" : "Restore version"}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
