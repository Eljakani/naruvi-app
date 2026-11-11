"use client"

import { NaruviAvatar, Otter } from "@/components/naruvi/otter"
import { useEffect, useId, useState } from "react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import { useTranslations } from "next-intl"

/** What each AI action does, in the order the server actually does it. Message keys under `aiSteps`. */
export const AI_STEPS = {
  importJob: ["importJob.0", "importJob.1", "importJob.2", "importJob.3"],
  analyze: ["analyze.0", "analyze.1", "analyze.2", "analyze.3", "analyze.4"],
  cv: ["cv.0", "cv.1", "cv.2", "cv.3", "cv.4"],
  letter: ["letter.0", "letter.1", "letter.2"],
  research: ["research.0", "research.1", "research.2", "research.3"],
  bullets: ["bullets.0", "bullets.1", "bullets.2"],
  cvImport: ["cvImport.0", "cvImport.1", "cvImport.2", "cvImport.3", "cvImport.4"],
  describe: ["describe.0", "describe.1", "describe.2", "describe.3"],
  extras: ["extras.0", "extras.1", "extras.2", "extras.3"],
  translate: ["translate.0", "translate.1", "translate.2"],
} as const

/** A step key in the reader's language; other text (already translated) passes through. */
export function useAiStepText() {
  const t = useTranslations("aiSteps")
  return (step: string) => (t.has(step as never) ? t(step as never) : step)
}

const STEP_MS = 1800

/** Advances through the steps while active and stays on the last one until the work is done. */
export function useStep(active: boolean, count: number) {
  const [step, setStep] = useState(0)
  const [lastActive, setLastActive] = useState(active)
  if (active !== lastActive) {
    setLastActive(active)
    setStep(0)
  }
  useEffect(() => {
    if (!active) return
    const timer = setInterval(() => setStep((value) => Math.min(value + 1, count - 1)), STEP_MS)
    return () => clearInterval(timer)
  }, [active, count])
  return step
}

/** Naruvi + shimmering current step + progress dots. */
export function AiSteps({ steps, step, className, avatar = true }: { steps: readonly string[]; step: number; className?: string; avatar?: boolean }) {
  const text = useAiStepText()
  return (
    <div role="status" aria-live="polite" className={cn("flex min-w-0 items-center gap-2.5", className)}>
      {avatar ? <NaruviAvatar size={28} className="cb-breathe" /> : null}
      <div className="grid min-w-0 gap-1.5">
        <span key={step} className="cb-step cb-shimmer truncate text-sm font-medium">
          {text(steps[step])}…
        </span>
        <span className="flex gap-1" aria-hidden>
          {steps.map((label, index) => (
            <span key={label} className={cn("cb-dot h-1 w-3 rounded-full", index <= step ? "bg-brand" : "bg-muted", index === step && "scale-x-125")} />
          ))}
        </span>
      </div>
    </div>
  )
}

/** Shows the steps in a toast for as long as `active` is true (survives navigation, dismissed on unmount). */
export function useAiToast(active: boolean, steps: readonly string[]) {
  const id = useId()
  const step = useStep(active, steps.length)
  useEffect(() => {
    if (!active) return void toast.dismiss(id)
    toast.custom(() => (
      <div className="flex w-80 items-end gap-2 overflow-hidden rounded-xl border bg-popover ps-2 pe-4 text-popover-foreground shadow-lg">
        <Otter pose="working-on-it" height={72} className="-mb-2 mt-2" />
        <AiSteps steps={steps} step={step} avatar={false} className="flex-1 py-4" />
      </div>
    ), { id, duration: Infinity })
  }, [active, step, steps, id])
  useEffect(() => () => void toast.dismiss(id), [id])
  return step
}
