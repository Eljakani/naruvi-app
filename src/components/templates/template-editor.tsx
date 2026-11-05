"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useRef, useState, useTransition } from "react"
import { ArrowLeftIcon, CopyIcon, RotateCcwIcon, SaveIcon, SparklesIcon, Trash2Icon } from "lucide-react"
import { toast } from "sonner"
import { aiDesignAction, deleteTemplateAction, saveTemplateAction } from "@/app/(app)/templates/actions"
import { AiSteps, useStep } from "@/components/ai-progress"
import { PdfPreview } from "@/components/documents/pdf-preview"
import { Button } from "@/components/ui/button"
import { Field, FieldContent, FieldDescription, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
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
      setTokens(result.data.tokens)
      setPrompt("")
      toast.success(result.data.summary)
    })

  const save = (asCopy = false) =>
    startSaving(async () => {
      const result = await saveTemplateAction({ id: asCopy ? undefined : initial.id, name: asCopy ? `${name} (copy)` : name, basedOn: initial.basedOn, tokens })
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

  const fontOptions = Object.entries(FONTS).map(([value, font]) => ({ value, label: font.name }))

  return (
    <div className="-mx-4 -mt-4 flex h-[calc(100svh-3.5rem)] flex-col md:-mx-6 md:-mt-6">
      <div className="flex flex-wrap items-center gap-3 border-b bg-background px-4 py-2.5 md:px-6">
        <Button variant="ghost" size="icon-sm" aria-label="Back to templates" nativeButton={false} render={<Link href="/templates" />}>
          <ArrowLeftIcon />
        </Button>
        <Input value={name} onChange={(event) => setName(event.target.value)} aria-label="Template name" className="h-8 w-64 font-medium" />
        <span className="text-xs text-muted-foreground">Based on {PRESETS[initial.basedOn]?.name ?? "Classic"}</span>
        <div className="ml-auto flex items-center gap-2">
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
        <div className="min-h-0 overflow-y-auto border-r bg-background">
          <div className="grid gap-6 p-4">
            <div className="grid gap-2 rounded-xl border p-3">
              <div className="flex items-center gap-2 text-sm font-medium">
                <SparklesIcon className="size-4" /> Describe what you want
              </div>
              <Textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && (event.metaKey || event.ctrlKey) && prompt.trim()) ask() }} placeholder="e.g. Make it look more premium, with a navy accent and a bit more space" className="min-h-16" disabled={asking} />
              {asking ? (
                <AiSteps steps={DESIGN_STEPS} step={step} />
              ) : (
                <div className="flex flex-wrap items-center gap-1.5">
                  {IDEAS.map((idea) => (
                    <Button key={idea} size="xs" variant="outline" onClick={() => ask(idea)} className="text-muted-foreground">
                      {idea}
                    </Button>
                  ))}
                  <Button size="sm" className="ml-auto" onClick={() => ask()} disabled={!prompt.trim()}>
                    <SparklesIcon /> Apply
                  </Button>
                </div>
              )}
            </div>

            <FieldSet>
              <FieldLegend>Typography</FieldLegend>
              <FieldGroup>
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
                <Range label="Text size" value={tokens.size} min={8} max={11.5} step={0.1} unit=" pt" onChange={(value) => set("size", value)} />
                <Range label="Name size" value={tokens.nameSize} min={14} max={32} step={1} unit=" pt" onChange={(value) => set("nameSize", value)} />
                <Range label="Line height" value={tokens.lineHeight} min={1.15} max={1.7} step={0.01} onChange={(value) => set("lineHeight", value)} />
              </FieldGroup>
            </FieldSet>

            <Separator />

            <FieldSet>
              <FieldLegend>Colour</FieldLegend>
              <FieldGroup>
                <Field>
                  <FieldLabel>Accent</FieldLabel>
                  <div className="flex flex-wrap items-center gap-2">
                    {ACCENTS.map((color) => (
                      <button key={color} type="button" onClick={() => set("accent", color)} aria-label={`Accent ${color}`} aria-pressed={tokens.accent === color} className={cn("size-7 rounded-full ring-offset-2 ring-offset-background transition-shadow", tokens.accent === color && "ring-2 ring-foreground")} style={{ backgroundColor: color }} />
                    ))}
                    <label className="relative size-7 cursor-pointer overflow-hidden rounded-full border" title="Custom colour">
                      <input type="color" value={tokens.accent} onChange={(event) => set("accent", event.target.value)} className="absolute -inset-2 size-12 cursor-pointer" aria-label="Custom accent colour" />
                    </label>
                  </div>
                </Field>
                <Toggle label="Name in accent" checked={tokens.accentName} onChange={(value) => set("accentName", value)} />
                <Toggle label="Headings in accent" checked={tokens.accentHeadings} onChange={(value) => set("accentHeadings", value)} />
                <Toggle label="Bullets in accent" checked={tokens.accentBullets} onChange={(value) => set("accentBullets", value)} />
              </FieldGroup>
            </FieldSet>

            <Separator />

            <FieldSet>
              <FieldLegend>Layout</FieldLegend>
              <FieldGroup>
                <Field>
                  <FieldLabel>Columns</FieldLabel>
                  <Choice label="Columns" value={tokens.layout} onChange={(value) => set("layout", value)} options={[{ value: "single", label: "One column" }, { value: "sidebar", label: "Side column" }]} />
                  {tokens.layout === "sidebar" ? <FieldDescription>Skills, languages and certifications move to a side column.</FieldDescription> : null}
                </Field>
                <Field>
                  <FieldLabel>Header</FieldLabel>
                  <Choice label="Header alignment" value={tokens.headerAlign} onChange={(value) => set("headerAlign", value)} options={[{ value: "left", label: "Left" }, { value: "center", label: "Centred" }]} />
                </Field>
                <Toggle label="Coloured header band" checked={tokens.headerBand} onChange={(value) => set("headerBand", value)} />
                <Range label="Page margins" value={tokens.margin} min={20} max={60} step={1} unit=" pt" onChange={(value) => set("margin", value)} />
                <Range label="Spacing between parts" value={tokens.spacing} min={0.6} max={1.6} step={0.05} unit="×" onChange={(value) => set("spacing", value)} />
              </FieldGroup>
            </FieldSet>

            <Separator />

            <FieldSet>
              <FieldLegend>Section headings</FieldLegend>
              <FieldGroup>
                <Choice label="Heading style" value={tokens.headingStyle} onChange={(value) => set("headingStyle", value)} options={[{ value: "rule", label: "Line" }, { value: "underline-accent", label: "Accent line" }, { value: "bar", label: "Side bar" }, { value: "filled", label: "Filled" }, { value: "plain", label: "Plain" }]} />
                <Choice label="Heading case" value={tokens.headingCase} onChange={(value) => set("headingCase", value)} options={[{ value: "upper", label: "UPPERCASE" }, { value: "none", label: "Normal" }]} />
              </FieldGroup>
            </FieldSet>

            <Separator />

            <FieldSet>
              <FieldLegend>Details</FieldLegend>
              <FieldGroup>
                <Field>
                  <FieldLabel>Bullets</FieldLabel>
                  <Choice label="Bullet style" value={tokens.bullet} onChange={(value) => set("bullet", value)} options={[{ value: "dot", label: "•" }, { value: "dash", label: "–" }, { value: "arrow", label: "›" }, { value: "square", label: "▪" }, { value: "none", label: "None" }]} />
                </Field>
                <Field>
                  <FieldLabel>Dates</FieldLabel>
                  <Choice label="Date position" value={tokens.datePosition} onChange={(value) => set("datePosition", value)} options={[{ value: "right", label: "On the right" }, { value: "below", label: "Under the title" }]} />
                </Field>
                <Field>
                  <FieldLabel>Photo shape</FieldLabel>
                  <Choice label="Photo shape" value={tokens.photoShape} onChange={(value) => set("photoShape", value)} options={[{ value: "circle", label: "Circle" }, { value: "rounded", label: "Rounded" }, { value: "square", label: "Square" }]} />
                </Field>
                <Toggle label="Company logos" checked={tokens.showLogos} onChange={(value) => set("showLogos", value)} />
                <Toggle label="Company names in italics" checked={tokens.orgItalic} onChange={(value) => set("orgItalic", value)} />
              </FieldGroup>
            </FieldSet>
          </div>
        </div>
        <div className="hidden min-h-0 flex-col gap-2 p-4 lg:flex">
          <p className="text-xs text-muted-foreground">Preview with your latest CV. {rendering ? "Updating…" : ""}</p>
          {previewUrl ? <PdfPreview key={previewUrl} url={previewUrl} busy={rendering} className="flex-1" /> : <div className="flex-1 animate-pulse rounded-xl bg-muted" />}
        </div>
      </div>
    </div>
  )
}
