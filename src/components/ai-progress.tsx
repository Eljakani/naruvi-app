"use client"

import { NaruviAvatar, Otter } from "@/components/naruvi/otter"
import { useEffect, useId, useState } from "react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"

/** What each AI action does, in the order the server actually does it. */
export const AI_STEPS = {
  importJob: ["Fetching the posting", "Reading role, company and location", "Finding the company website", "Looking for the logo"],
  analyze: ["Reading the posting", "Separating requirements from hiring steps and perks", "Matching each requirement to your verified facts", "Double-checking every match", "Scoring your fit"],
  cv: ["Picking your strongest evidence", "Tailoring bullets to this job", "Ordering skills by relevance", "Verifying every rewritten line", "Rendering the PDF and running quality checks"],
  letter: ["Reading the posting and your notes", "Drafting a short letter", "Checking the draft and rendering the PDF"],
  research: ["Checking what the site allows", "Reading the company’s own pages", "Finding mission, values and facts", "Writing cited angles"],
  bullets: ["Reading your facts", "Drafting bullets in each language", "Checking each one against its facts"],
  cvImport: ["Reading your CV", "Finding each job, school and project", "Splitting achievements into facts", "Picking out skills and dates", "Checking every number against your CV"],
  describe: ["Reading what you wrote", "Finding role, dates and place", "Turning it into facts", "Picking out skills"],
  translate: ["Translating titles and dates", "Translating bullets", "Checking every number is unchanged"],
} as const

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
  return (
    <div role="status" aria-live="polite" className={cn("flex min-w-0 items-center gap-2.5", className)}>
      {avatar ? <NaruviAvatar size={28} className="cb-breathe" /> : null}
      <div className="grid min-w-0 gap-1.5">
        <span key={step} className="cb-step cb-shimmer truncate text-sm font-medium">
          {steps[step]}…
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
