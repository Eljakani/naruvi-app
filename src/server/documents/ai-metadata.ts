import { z } from "zod"

export const aiAssistance = z.object({
  status: z.enum(["applied", "unchanged", "fallback"]),
  model: z.string().default(""),
  promptVersion: z.string(),
  changes: z.number().int().nonnegative(),
  reviewed: z.boolean().default(false),
  reason: z.string().max(500).optional(),
  inputTokens: z.number().nullable().optional(),
  outputTokens: z.number().nullable().optional(),
})
export type AiAssistance = z.infer<typeof aiAssistance>

export function aiReviewCheck(ai?: AiAssistance) {
  if (!ai) return null
  if (ai.status === "unchanged") return { id: "ai-review", status: "pass" as const, label: "AI assistance", detail: "AI checked the selection and kept the original wording." }
  if (ai.status === "fallback") return { id: "ai-review", status: "warn" as const, label: "AI assistance", detail: ai.reason ?? "AI could not improve this draft. The standard grounded version was kept." }
  return {
    id: "ai-review", status: ai.reviewed ? "pass" as const : "fail" as const,
    label: "AI wording reviewed",
    detail: ai.reviewed ? "You reviewed the AI-assisted draft." : "Review the AI changes against your facts and company sources, then approve the draft in the editor.",
  }
}
