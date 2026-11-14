"use client"

import { useTransition } from "react"
import { useRouter } from "next/navigation"
import { ScanSearchIcon, SparklesIcon } from "lucide-react"
import { toast } from "sonner"
import { AI_STEPS, useAiToast } from "@/components/ai-progress"
import { checkFitAction } from "@/app/[locale]/(app)/applications/actions"
import { Button } from "@/components/ui/button"
import { useTranslations } from "next-intl"

/**
 * Runs the evidence-based fit analysis for a job (creates the application if
 * needed), then opens the result. A check that fails says so in a toast and
 * leaves the page as it was: never an error screen.
 */
export function AnalyzeButton({ jobId, label, variant = "default" }: { jobId: string; label?: string; variant?: "default" | "outline" }) {
  const t = useTranslations("application")
  const router = useRouter()
  const [pending, start] = useTransition()
  useAiToast(pending, AI_STEPS.analyze)
  const check = () =>
    start(async () => {
      const result = await checkFitAction(jobId).catch(() => ({ ok: false as const, applicationId: null, error: "" }))
      if (!result.ok) toast.error(t("fitFailedTitle"), { description: result.error || t("fitFailedBody") })
      // The result (or the failure, with its trace) lives on the application page.
      if (result.applicationId) router.push(`/applications/${result.applicationId}`)
      router.refresh()
    })
  return (
    <Button type="button" variant={variant} disabled={pending} onClick={check} className={variant === "default" ? "bg-brand text-brand-foreground hover:bg-brand/90" : undefined}>
      {pending ? <SparklesIcon className="cb-breathe" /> : <ScanSearchIcon />} <span className={pending ? "cb-shimmer" : undefined}>{pending ? t("checking") : label ?? t("checkFit")}</span>
    </Button>
  )
}
