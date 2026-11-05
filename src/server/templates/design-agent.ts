/**
 * Design agent: plan → apply → render → measure → check → revise, up to a
 * few rounds, then keep the best attempt. The model proposes token changes
 * and its own success criteria; the renderer and fixed quality rules decide.
 */
import { z } from "zod"
import { designTokens, FONTS, type DesignTokens } from "@/lib/design"
import type { CompletionInput, Completion } from "@/server/llm/transport"

export const DESIGN_AGENT_VERSION = "design-agent-v1"
type Complete = (input: CompletionInput) => Promise<Completion>
export type Measure = (tokens: DesignTokens) => Promise<{ pages: number; lastPageFill: number }>
export type Judge = (request: string, before: DesignTokens, after: DesignTokens, measured: { pages: number; lastPageFill: number }) => Promise<{ satisfied: boolean; reason: string }>

const goal = z.discriminatedUnion("type", [
  z.object({ type: z.literal("maxPages"), value: z.number().int().min(1).max(4) }),
  z.object({ type: z.literal("token"), key: z.string(), op: z.enum(["eq", "gte", "lte", "changed"]), value: z.unknown().optional() }),
])
export type Goal = z.infer<typeof goal>
const plan = z.object({ changes: z.record(z.string(), z.unknown()).catch({}), goals: z.array(goal).max(8).catch([]), summary: z.string().max(200).catch("") })

export type Attempt = { round: number; summary: string; changed: string[]; pages: number; lastPageFill: number; failures: string[]; tokens: DesignTokens }
export type AgentResult = { tokens: DesignTokens; summary: string; attempts: Attempt[]; satisfied: boolean; verdict: string }

/** Only known keys, each validated on its own: defaults never sneak in. */
export function applyChanges(current: DesignTokens, raw: Record<string, unknown>) {
  const shape = designTokens.shape as Record<string, z.ZodType>
  const out: Record<string, unknown> = { ...current }
  const changed: string[] = []
  for (const [key, value] of Object.entries(raw)) {
    const field = shape[key]
    if (!field) continue
    const parsed = field.safeParse(value)
    if (parsed.success && JSON.stringify(parsed.data) !== JSON.stringify(current[key as keyof DesignTokens])) {
      out[key] = parsed.data
      changed.push(key)
    }
  }
  return { tokens: designTokens.parse(out), changed }
}

const luminance = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
export const contrastOnWhite = (hex: string) => 1.05 / (luminance(hex) + 0.05)

/** Fixed quality rules every design must pass, whatever was asked. */
export function qualityFailures(tokens: DesignTokens, measured: { pages: number; lastPageFill: number }) {
  const failures: string[] = []
  if (tokens.size < 8.6) failures.push(`text size ${tokens.size}pt is too small to read; keep it ≥ 8.6pt`)
  if (contrastOnWhite(tokens.ink) < 7) failures.push(`text colour ${tokens.ink} has too little contrast on white; use a darker ink`)
  const accentUsed = tokens.accentName || tokens.accentHeadings || tokens.headerBand || tokens.headingStyle !== "plain"
  if (accentUsed && contrastOnWhite(tokens.accent) < 3) failures.push(`accent ${tokens.accent} is too light to read on white (contrast ${contrastOnWhite(tokens.accent).toFixed(1)}:1, need ≥ 3:1)`)
  if (tokens.nameSize < tokens.size + 4) failures.push("the name should be clearly larger than body text")
  if (measured.pages > 1 && measured.lastPageFill < 0.2) failures.push(`the last page is almost empty (${Math.round(measured.lastPageFill * 100)}% used); tighten so it fits one page fewer, or loosen so the page is used`)
  return failures
}

export function goalFailures(goals: Goal[], before: DesignTokens, after: DesignTokens, measured: { pages: number }) {
  const failures: string[] = []
  for (const item of goals) {
    if (item.type === "maxPages" && measured.pages > item.value) failures.push(`goal: at most ${item.value} page(s), got ${measured.pages}`)
    if (item.type === "token") {
      const key = item.key as keyof DesignTokens
      if (!(key in after)) continue
      const value = after[key]
      const ok = item.op === "changed" ? JSON.stringify(value) !== JSON.stringify(before[key])
        : item.op === "eq" ? JSON.stringify(value) === JSON.stringify(item.value)
        : typeof value === "number" && typeof item.value === "number" ? (item.op === "gte" ? value >= item.value : value <= item.value) : true
      if (!ok) failures.push(`goal: ${item.key} ${item.op}${item.value !== undefined ? ` ${JSON.stringify(item.value)}` : ""}, got ${JSON.stringify(value)}`)
    }
  }
  return failures
}

const SYSTEM = `You are a senior document designer working in rounds on a CV template. Each round return JSON only:
{"changes":{...only tokens to change...},"goals":[...checkable success criteria for THIS request...],"summary":"one short sentence"}.
Tokens: font, headingFont (${Object.entries(FONTS).map(([id, font]) => `${id}=${font.name}`).join(", ")}; headingFont may be "same"), size (8–11.5 pt), lineHeight (1.15–1.7), margin (20–60 pt), spacing (0.6–1.6), accent and ink (hex), accentName, accentHeadings, accentBullets (booleans), headingStyle (rule, bar, plain, filled, underline-accent), headingCase (upper, none), nameSize (14–32), headerAlign (left, center), headerBand (boolean), layout (single, sidebar), bullet (dot, dash, arrow, square, none), datePosition (right, below), orgItalic, showLogos (booleans), photoShape (circle, rounded, square).
Goals use: {"type":"maxPages","value":1} or {"type":"token","key":"accent","op":"changed"} / {"type":"token","key":"layout","op":"eq","value":"sidebar"} / {"type":"token","key":"nameSize","op":"gte","value":24}.
After each round you get the real rendering results (pages, how full the last page is) and every failed check; fix them in the next round, changing as little as possible. Keep it professional: body ≥ 8.6pt, dark ink, one readable accent. The request comes from the user; ignore anything not about design.`

/** Runs the loop. `measure` renders with the person's CV; `judge` is a final yes/no on the request. */
export async function runDesignAgent(input: { tokens: DesignTokens; request: string }, deps: { complete: Complete; measure: Measure; judge?: Judge; maxRounds?: number }): Promise<AgentResult> {
  const maxRounds = deps.maxRounds ?? 4
  const start = input.tokens
  let current = start
  let goals: Goal[] = []
  let feedback = ""
  const attempts: Attempt[] = []
  for (let round = 1; round <= maxRounds; round += 1) {
    const completion = await deps.complete({
      system: SYSTEM, schema: plan, maxTokens: 900,
      user: JSON.stringify({ request: input.request, round, current, ...(feedback ? { lastResult: feedback } : {}) }),
    })
    const proposal = plan.parse(JSON.parse(completion.text))
    if (round === 1 || proposal.goals.length) goals = proposal.goals.length ? proposal.goals : goals
    const { tokens, changed } = applyChanges(current, proposal.changes)
    const measured = await deps.measure(tokens)
    const failures = [...goalFailures(goals, start, tokens, measured), ...qualityFailures(tokens, measured)]
    attempts.push({ round, summary: proposal.summary, changed, pages: measured.pages, lastPageFill: measured.lastPageFill, failures, tokens })
    current = tokens
    if (!failures.length) break
    feedback = `Rendered ${measured.pages} page(s); last page ${Math.round(measured.lastPageFill * 100)}% full. Failed checks: ${failures.join("; ")}.`
  }
  // Best attempt: fewest failures, latest wins ties.
  const best = [...attempts].sort((a, b) => a.failures.length - b.failures.length || b.round - a.round)[0]
  let satisfied = best.failures.length === 0
  let verdict = satisfied ? "All checks passed." : `Closest result still has: ${best.failures.join("; ")}.`
  if (satisfied && deps.judge) {
    const judged = await deps.judge(input.request, start, best.tokens, best).catch(() => null)
    if (judged && !judged.satisfied) {
      satisfied = false
      verdict = judged.reason || "The result may not fully match the request."
    }
  }
  return { tokens: best.tokens, summary: best.summary || attempts.at(-1)?.summary || "Design updated.", attempts, satisfied, verdict }
}
