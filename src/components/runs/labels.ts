/** Workflows with a translated name (`labels.workflow.<id with _>`). */
const WORKFLOWS = ["application_analyze", "mail_classify", "mail_draft", "mail_send", "assistant_chat", "company_research", "cv_generate", "cv_revise", "letter_generate", "letter_revise", "job_preview", "job_enrich", "profile_bullets", "profile_describe", "template_design", "ai_sdk_smoke", "ai_sdk_large_cv_check"] as const
export type WorkflowKey = (typeof WORKFLOWS)[number]

/** Unknown ids ("foo.bar_baz") still read as words, never as code. */
export function workflowLabel(workflow: string, t: (key: WorkflowKey) => string) {
  const key = workflow.replace(/[.-]/g, "_")
  return (WORKFLOWS as readonly string[]).includes(key) ? t(key as WorkflowKey) : workflow.replace(/[._-]+/g, " ").replace(/^\w/, (c) => c.toUpperCase())
}

export function duration(ms: number | null | undefined, locale: string) {
  if (ms == null) return "—"
  const unit = (value: number, unit: string, digits = 0) => new Intl.NumberFormat(locale, { style: "unit", unit, unitDisplay: "short", maximumFractionDigits: digits, minimumFractionDigits: digits }).format(value)
  if (ms < 1000) return unit(Math.round(ms), "millisecond")
  if (ms < 60_000) return unit(ms / 1000, "second", 1)
  return `${unit(Math.floor(ms / 60_000), "minute")} ${unit(Math.round((ms % 60_000) / 1000), "second")}`
}

export function compact(n: number, locale: string) {
  return new Intl.NumberFormat(locale, n >= 10_000 ? { notation: "compact", maximumFractionDigits: 1 } : {}).format(n)
}

export function ago(date: Date, now: number, locale: string) {
  const s = Math.max(0, Math.round((now - date.getTime()) / 1000))
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto", style: "short" })
  if (s < 60) return rtf.format(0, "second")
  if (s < 3600) return rtf.format(-Math.floor(s / 60), "minute")
  if (s < 86_400) return rtf.format(-Math.floor(s / 3600), "hour")
  return date.toLocaleDateString(locale, { day: "numeric", month: "short" })
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
