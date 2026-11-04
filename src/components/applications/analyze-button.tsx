"use client"

import { useFormStatus } from "react-dom"
import { Loader2Icon, ScanSearchIcon } from "lucide-react"
import { analyzeJobAction } from "@/app/(app)/applications/actions"
import { Button } from "@/components/ui/button"

function Submit({ label, variant }: { label: string; variant: "default" | "outline" }) {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" variant={variant} disabled={pending}>
      {pending ? <Loader2Icon className="animate-spin" /> : <ScanSearchIcon />} {pending ? "Analyzing…" : label}
    </Button>
  )
}

/** Runs the evidence-based fit analysis for a job (creates the application if needed). */
export function AnalyzeButton({ jobId, label = "Analyze my fit", variant = "default" }: { jobId: string; label?: string; variant?: "default" | "outline" }) {
  return (
    <form action={analyzeJobAction}>
      <input type="hidden" name="jobId" value={jobId} />
      <Submit label={label} variant={variant} />
    </form>
  )
}
