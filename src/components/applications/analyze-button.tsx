"use client"

import { useFormStatus } from "react-dom"
import { ScanSearchIcon, SparklesIcon } from "lucide-react"
import { AI_STEPS, useAiToast } from "@/components/ai-progress"
import { analyzeJobAction } from "@/app/[locale]/(app)/applications/actions"
import { Button } from "@/components/ui/button"
import { useTranslations } from "next-intl"

function Submit({ label, variant }: { label?: string; variant: "default" | "outline" }) {
  const t = useTranslations("application")
  const { pending } = useFormStatus()
  useAiToast(pending, AI_STEPS.analyze)
  return (
    <Button type="submit" variant={variant} disabled={pending} className={variant === "default" ? "bg-brand text-brand-foreground hover:bg-brand/90" : undefined}>
      {pending ? <SparklesIcon className="cb-breathe" /> : <ScanSearchIcon />} <span className={pending ? "cb-shimmer" : undefined}>{pending ? t("checking") : label ?? t("checkFit")}</span>
    </Button>
  )
}

/** Runs the evidence-based fit analysis for a job (creates the application if needed). */
export function AnalyzeButton({ jobId, label, variant = "default" }: { jobId: string; label?: string; variant?: "default" | "outline" }) {
  return (
    <form action={analyzeJobAction}>
      <input type="hidden" name="jobId" value={jobId} />
      <Submit label={label} variant={variant} />
    </form>
  )
}
