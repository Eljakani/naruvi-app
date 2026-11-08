export const WORKFLOW_LABEL: Record<string, string> = {
  "application.analyze": "Fit check",
  "mail.classify": "Read email replies",
  "mail.draft": "Drafted an email",
  "mail.send": "Sent an email",
  "assistant.chat": "Chat with Naruvi",
  "company.research": "Company research",
  "cv.generate": "CV generation",
  "cv.revise": "CV revision",
  "letter.generate": "Cover letter generation",
  "letter.revise": "Cover letter revision",
  "job.preview": "Job import",
  "job.enrich": "Job enrichment",
  "profile.bullets": "Bullet suggestions",
  "profile.describe": "Profile description",
  "template.design": "Template design",
  "ai.sdk.smoke": "Model connection test",
  "ai.sdk.large-cv-check": "Model output-limit test",
}

/** Unknown ids ("foo.bar_baz") still read as words, never as code. */
export const workflowLabel = (workflow: string) => WORKFLOW_LABEL[workflow] ?? (workflow.replace(/[._-]+/g, " ").replace(/^\w/, (c) => c.toUpperCase()))

export function duration(ms: number | null | undefined) {
  if (ms == null) return "—"
  if (ms < 1000) return `${Math.round(ms)} ms`
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)} s`
  return `${Math.floor(ms / 60_000)} min ${Math.round((ms % 60_000) / 1000)} s`
}

export function compact(n: number) {
  return n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 10_000 ? `${Math.round(n / 1000)}k` : n.toLocaleString()
}

export function ago(date: Date, now = Date.now()) {
  const s = Math.max(0, Math.round((now - date.getTime()) / 1000))
  if (s < 60) return "just now"
  if (s < 3600) return `${Math.floor(s / 60)} min ago`
  if (s < 86_400) return `${Math.floor(s / 3600)} h ago`
  return date.toLocaleDateString(undefined, { day: "numeric", month: "short" })
}

/** What a step is, from its name: AI request, decision request, render or other. */
export type StepKind = "ai" | "decision" | "render" | "step"
export function stepKind(name: string, model: string | null): StepKind {
  if (/^decision|decisions?:|decision model|\bjev\b/i.test(name)) return "decision"
  // Wrapper steps ("AI tailor CV") contain the actual request; only requests record a model.
  if (model || /^AI request/.test(name)) return "ai"
  if (/render|measure|quality gate/i.test(name)) return "render"
  return "step"
}
/** Older traces said "1 questions". */
export const stepName = (name: string) => name.replace(/\b1 questions\b/, "1 question")

export const STEP_KIND_LABEL: Record<StepKind, string> = { ai: "AI request", decision: "Decision", render: "Render", step: "Step" }
