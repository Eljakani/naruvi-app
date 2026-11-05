"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useRef, useState, useTransition } from "react"
import { ArrowLeftIcon, CopyIcon, HistoryIcon, RotateCcwIcon, SaveIcon, SparklesIcon, StarIcon, Trash2Icon } from "lucide-react"
import { toast } from "sonner"
import { aiDesignAction, deleteTemplateAction, restoreTemplateVersionAction, saveTemplateAction, setDefaultDesignAction, templateVersionsAction } from "@/app/(app)/templates/actions"
import { PdfThumb } from "@/components/templates/pdf-thumb"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import type { TemplateVersion } from "@/server/templates/service"
import { AiSteps, useStep } from "@/components/ai-progress"
import { PdfPreview } from "@/components/documents/pdf-preview"
import { Button } from "@/components/ui/button"
import { Field, FieldContent, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Slider } from "@/components/ui/slider"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { FONTS, PRESETS, type DesignTokens } from "@/lib/design"
import { cn } from "@/lib/utils"

const ACCENTS = ["#2563eb", "#0f766e", "#4338ca", "#7c3aed", "#be123c", "#c2410c", "#1e3a5f", "#111827"]
const IDEAS = ["Make it fit on one page", "More elegant and minimal", "Use a dark green accent", "Bigger name, centred header", "Two columns with skills on the side"]
const DESIGN_STEPS = ["Reading your request", "Adjusting the design", "Rendering the preview"]

type Initial = { id?: string; name: string; basedOn: string; tokens: DesignTokens }

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
  return (
    <Field orientation="horizontal">
      <FieldContent>
        <FieldLabel>{label}</FieldLabel>
        {hint ? <FieldDescription>{hint}</FieldDescription> : null}
      </FieldContent>
      <Switch checked={checked} onCheckedChange={onChange} />
    </Field>
  )
}

/** Visual template editor: controls, AI prompt, live preview with your own CV. */
export function TemplateEditor({ initial }: { initial: Initial }) {
  const router = useRouter()
  const [name, setName] = useState(initial.name)
  const [tokens, setTokens] = useState(initial.tokens)
  const [saved, setSaved] = useState(JSON.stringify({ name: initial.name, tokens: initial.tokens }))
  const [prompt, setPrompt] = useState("")
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [rendering, setRendering] = useState(false)
  const [asking, startAsking] = useTransition()
  const [saving, startSaving] = useTransition()
  const step = useStep(asking, DESIGN_STEPS.length)
  const [flash, setFlash] = useState<Set<string>>(new Set())
  const [panel, setPanel] = useState("design")
  const [versions, setVersions] = useState<TemplateVersion[] | null>(null)
  const [lastPrompt, setLastPrompt] = useState("")
  const glow = (...keys: (keyof DesignTokens)[]) => keys.some((key) => flash.has(key))
  const previous = useRef<string | null>(null)
  const dirty = JSON.stringify({ name, tokens }) !== saved
  const set = <K extends keyof DesignTokens>(key: K, value: DesignTokens[K]) => setTokens((current) => ({ ...current, [key]: value }))

  // Debounced live preview: a fresh PDF of your latest CV in this design.
  useEffect(() => {
    const controller = new AbortController()
    const timer = setTimeout(async () => {
      setRendering(true)
      try {
        const response = await fetch("/api/templates/preview", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ tokens }), signal: controller.signal })
        if (!response.ok) return
        const url = URL.createObjectURL(await response.blob())
        if (previous.current) URL.revokeObjectURL(previous.current)
        previous.current = url
        setPreviewUrl(url)
      } catch {
        // superseded by a newer change
      } finally {
        if (!controller.signal.aborted) setRendering(false)
      }
    }, 350)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [tokens])

  const ask = (text = prompt) =>
    startAsking(async () => {
      const result = await aiDesignAction({ tokens, prompt: text })
      if (!result.ok) return void toast.error(result.message)
      const changed = Object.keys(result.data.tokens).filter((key) => JSON.stringify(result.data.tokens[key as keyof DesignTokens]) !== JSON.stringify(tokens[key as keyof DesignTokens]))
      setTokens(result.data.tokens)
      setLastPrompt(text)
      setPrompt("")
      setFlash(new Set(changed))
      setTimeout(() => setFlash(new Set()), 1600)
      toast.success(result.data.summary, { description: changed.length ? `${changed.length} setting${changed.length === 1 ? "" : "s"} changed. Not saved yet.` : undefined })
    })

  const save = (asCopy = false) =>
    startSaving(async () => {
      const result = await saveTemplateAction({ id: asCopy ? undefined : initial.id, name: asCopy ? `${name} (copy)` : name, basedOn: initial.basedOn, tokens, note: lastPrompt ? `AI: ${lastPrompt}`.slice(0, 200) : undefined })
      setLastPrompt("")
      setVersions(null)
      if (!result.ok) return void toast.error(result.message)
      setSaved(JSON.stringify({ name, tokens }))
      toast.success(asCopy ? "Saved as a new template" : "Template saved", { description: "Pick it in any CV or letter, under Look." })
      if (!initial.id || asCopy) router.replace(`/templates/${result.data.id}`)
      else router.refresh()
    })

  const remove = () =>
    startSaving(async () => {
      if (!initial.id) return
      const result = await deleteTemplateAction(initial.id)
      if (!result.ok) return void toast.error(result.message)
      toast.success("Template deleted")
      router.push("/templates")
    })

  const makeDefault = () =>
    startSaving(async () => {
      const presetTokens = PRESETS[initial.basedOn]?.tokens
      const untouchedPreset = !initial.id && presetTokens && JSON.stringify({ ...tokens, accent: presetTokens.accent }) === JSON.stringify(presetTokens)
      const result = await setDefaultDesignAction({ templateRef: initial.id && !dirty ? initial.id : undefined, preset: untouchedPreset ? initial.basedOn : undefined, tokens })
      if (!result.ok) return void toast.error(result.message)
      toast.success("Set as your default design", { description: "New CVs and letters will start with it. Existing ones keep their look." })
    })

  const openHistory = async () => {
    setPanel("history")
    if (!initial.id || versions) return
    const result = await templateVersionsAction(initial.id)
    if (result.ok) setVersions(result.data)
  }
  const restore = (version: TemplateVersion) =>
    startSaving(async () => {
      if (!initial.id) return
      const result = await restoreTemplateVersionAction(initial.id, version.id)
      if (!result.ok) return void toast.error(result.message)
      setTokens(result.data)
      setSaved(JSON.stringify({ name, tokens: result.data }))
      setVersions(null)
      setPanel("design")
      toast.success("Version restored", { description: "Saved as the latest version; nothing was lost." })
    })

  const fontOptions = Object.entries(FONTS).map(([value, font]) => ({ value, label: font.name }))

  return (
    <div className="-mx-4 -mt-4 flex h-[calc(100svh-3.5rem)] flex-col md:-mx-6 md:-mt-6">
      <div className="flex flex-wrap items-center gap-3 border-b bg-background px-4 py-2.5 md:px-6">
        <Button variant="ghost" size="icon-sm" aria-label="Back to templates" nativeButton={false} render={<Link href="/templates" />}>
          <ArrowLeftIcon />
        </Button>
        <Input value={name} onChange={(event) => setName(event.target.value)} aria-label="Template name" className="h-8 w-64 font-medium" />
        {dirty ? <span className="cb-fade flex items-center gap-1.5 text-xs text-muted-foreground"><span className="size-1.5 rounded-full bg-primary" /> Unsaved changes</span> : null}
        <span className="hidden text-xs text-muted-foreground xl:inline">Based on {PRESETS[initial.basedOn]?.name ?? "Classic"}</span>
        <div className="ml-auto flex items-center gap-2">
          <Button size="sm" variant="ghost" onClick={makeDefault} disabled={saving}>
            <StarIcon /> Use as default
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setTokens(PRESETS[initial.basedOn]?.tokens ?? PRESETS.classic.tokens)} disabled={saving}>
            <RotateCcwIcon /> Reset
          </Button>
          {initial.id ? (
            <>
              <Button size="sm" variant="ghost" onClick={remove} disabled={saving} aria-label="Delete template">
                <Trash2Icon />
              </Button>
              <Button size="sm" variant="outline" onClick={() => save(true)} disabled={saving}>
                <CopyIcon /> Save as copy
              </Button>
            </>
          ) : null}
          <Button size="sm" onClick={() => save()} disabled={saving || (!dirty && Boolean(initial.id))}>
            <SaveIcon /> {initial.id ? (dirty ? "Save changes" : "Saved") : "Save template"}
          </Button>
        </div>
      </div>

      <div className="grid min-h-0 flex-1 lg:grid-cols-[400px_minmax(0,1fr)]">
        <Tabs value={panel} onValueChange={(value) => (value === "history" ? void openHistory() : setPanel(value))} className="flex min-h-0 flex-col gap-0 border-r bg-background">
          <TabsList variant="line" className="w-full justify-start gap-1 border-b px-3">
            <TabsTrigger value="design">Design</TabsTrigger>
            <TabsTrigger value="history" disabled={!initial.id} className="gap-1.5">
              <HistoryIcon className="size-3.5" /> History
            </TabsTrigger>
          </TabsList>
          <div className="min-h-0 flex-1 overflow-y-auto">
            <TabsContent value="design" className="grid gap-4 p-4">
              <div className="grid gap-2 rounded-xl border bg-muted/30 p-3">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <SparklesIcon className={cn("size-4", asking && "cb-breathe")} /> Describe what you want
                </div>
                <Textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && (event.metaKey || event.ctrlKey) && prompt.trim()) ask() }} placeholder="e.g. Make it look more premium, with a navy accent and a bit more space" className="min-h-16 bg-background" disabled={asking} />
                {asking ? (
                  <AiSteps steps={DESIGN_STEPS} step={step} />
                ) : (
                  <div className="cb-stagger flex flex-wrap items-center gap-1.5">
                    {IDEAS.map((idea) => (
                      <Button key={idea} size="xs" variant="outline" onClick={() => ask(idea)} className="bg-background text-muted-foreground">
                        {idea}
                      </Button>
                    ))}
                    <Button size="sm" className="ml-auto" onClick={() => ask()} disabled={!prompt.trim()}>
                      <SparklesIcon /> Apply
                    </Button>
                  </div>
                )}
              </div>

              <Accordion multiple defaultValue={["type", "colour", "layout"]} className="grid">
                <AccordionItem value="type">
                  <AccordionTrigger>Typography</AccordionTrigger>
                  <AccordionContent>
                    <FieldGroup className="gap-4 pt-1">
                      <Flash on={glow("font", "headingFont")}>
                        <div className="grid grid-cols-2 gap-3">
                          <Field>
                            <FieldLabel>Text font</FieldLabel>
                            <Select items={fontOptions} value={tokens.font} onValueChange={(value) => value && set("font", value as DesignTokens["font"])}>
                              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                              <SelectContent>{fontOptions.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent>
                            </Select>
                          </Field>
                          <Field>
                            <FieldLabel>Heading font</FieldLabel>
                            <Select items={[{ value: "same", label: "Same as text" }, ...fontOptions]} value={tokens.headingFont} onValueChange={(value) => value && set("headingFont", value)}>
                              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
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
            </TabsContent>

            <TabsContent value="history" className="grid gap-2 p-4">
              <p className="text-xs text-muted-foreground">Every save is kept. Restoring makes a new version, so nothing is ever lost.</p>
              {!versions ? (
                <div className="grid gap-2">{[0, 1, 2].map((i) => <div key={i} className="h-20 animate-pulse rounded-lg bg-muted" />)}</div>
              ) : (
                <ol className="cb-stagger grid gap-2">
                  {versions.map((version, index) => (
                    <li key={version.id} className="flex items-center gap-3 rounded-lg border p-2">
                      <PdfThumb tokens={version.tokens} className="w-14 shrink-0" />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium">{index === 0 ? "Current" : version.createdAt.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}</div>
                        <div className="truncate text-xs text-muted-foreground">{version.note.startsWith("restored") ? "Restored an earlier version" : version.note === "created" ? "Created" : version.note === "saved" ? "Saved" : version.note}</div>
                      </div>
                      {index > 0 ? (
                        <Button size="xs" variant="outline" onClick={() => restore(version)} disabled={saving}>
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
        <div className="hidden min-h-0 flex-col gap-2 p-4 lg:flex">
          <p className="text-xs text-muted-foreground">Preview with your latest CV. {rendering ? "Updating…" : ""}</p>
          {previewUrl ? <PdfPreview url={previewUrl} busy={rendering} className="cb-enter flex-1" /> : <div className="flex-1 animate-pulse rounded-xl bg-muted" />}
        </div>
      </div>
    </div>
  )
}
