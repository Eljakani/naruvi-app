export const WORKFLOW_LABEL: Record<string, string> = {
  "application.analyze": "Fit analysis",
  "company.research": "Company research",
  "cv.generate": "CV generation",
  "letter.generate": "Cover letter generation",
  "job.preview": "Job import",
  "profile.bullets": "Bullet suggestions",
}

export const workflowLabel = (workflow: string) => WORKFLOW_LABEL[workflow] ?? workflow

export function duration(ms: number | null | undefined) {
  if (ms == null) return "—"
  if (ms < 1000) return `${Math.round(ms)} ms`
  return `${(ms / 1000).toFixed(1)} s`
}
