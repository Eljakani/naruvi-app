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
const plan = z.object({ changes: z.record(z.string(), z.unknown()).catch({}), goals: z.array(goal).max(8).catch([]), summary: z.string().max(200).catch(""), unsupported: z.string().max(200).catch("") })

/** Short, user-facing labels for failed checks (the long text goes to the model). */
export type Issue = "balance" | "pages" | "small-text" | "light-text" | "light-accent" | "name-size" | "empty-page" | "goal"
export type Attempt = { round: number; summary: string; changed: string[]; pages: number; lastPageFill: number; failures: string[]; issues: Issue[]; tokens: DesignTokens }
/** applied: all checks passed and the design changed. rejected: nothing applied, `reason` says why in one sentence. */
export type AgentResult = { outcome: "applied" | "rejected" | "unchanged"; tokens: DesignTokens; summary: string; reason: string; rounds: number; pages: number; changed: string[]; attempts: Attempt[] }

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
export const issueOf = (failure: string): Issue =>
  /overpower|compete|out of proportion|dominates|look heavy|coloured blocks|tightly spaced/.test(failure) ? "balance" : /page\(s\), got/.test(failure) ? "pages" : /text size/.test(failure) ? "small-text" : /text colour/.test(failure) ? "light-text" : /accent/.test(failure) ? "light-accent" : /name should/.test(failure) ? "name-size" : /last page/.test(failure) ? "empty-page" : "goal"

const ISSUE_REASON: Record<Issue, string> = {
  balance: "it would throw the page out of balance (headings, name and photo need a clear hierarchy)",
  pages: "it couldn’t fit in the page count you asked for without making the text too small",
  "small-text": "the text would be too small to read",
  "light-text": "documents print on white, so light text wouldn’t be readable",
  "light-accent": "that colour is too light to read on a white page",
  "name-size": "your name would no longer stand out",
  "empty-page": "it would leave a nearly empty last page",
  goal: "the result didn’t match what you asked",
}

export function qualityFailures(tokens: DesignTokens, measured: { pages: number; lastPageFill: number }) {
  const failures: string[] = []
  if (tokens.size < 8.6) failures.push(`text size ${tokens.size}pt is too small to read; keep it ≥ 8.6pt`)
  if (contrastOnWhite(tokens.ink) < 7) failures.push(`text colour ${tokens.ink} has too little contrast on white; use a darker ink`)
  const accentUsed = tokens.accentName || tokens.accentHeadings || tokens.headerBand || tokens.headingStyle !== "plain"
  if (accentUsed && contrastOnWhite(tokens.accent) < 3) failures.push(`accent ${tokens.accent} is too light to read on white (contrast ${contrastOnWhite(tokens.accent).toFixed(1)}:1, need ≥ 3:1)`)
  if (tokens.nameSize < tokens.size + 4) failures.push("the name should be clearly larger than body text")
  // Proportions: a clear hierarchy name > section headings > entry titles > body, without shouting.
  const heading = tokens.size * tokens.headingSize
  if (tokens.headingSize > 1.35) failures.push(`section headings at ${heading.toFixed(1)}pt overpower the content; keep headingSize ≤ 1.35 (the name and photo area is the "header", not the section headings)`)
  if (heading > tokens.nameSize * 0.6) failures.push("section headings compete with the name; they should be well under 60% of the name size")
  if (tokens.nameSize > tokens.size * 3.4) failures.push(`the name at ${tokens.nameSize}pt is out of proportion with ${tokens.size}pt text; keep it under ${Math.round(tokens.size * 3.4)}pt`)
  if (tokens.photoSize > tokens.nameSize * 4) failures.push("the photo dominates the header; reduce photoSize or raise nameSize")
  if (tokens.headingCase === "upper" && tokens.headingSize > 1.25) failures.push("uppercase headings this large look heavy; lower headingSize to ≤ 1.25 or use normal case")
  const loud = [tokens.headerBand, tokens.headingStyle === "filled", tokens.sidebarTint, tokens.accentBullets && tokens.accentHeadings && tokens.accentName && tokens.accentLinks].filter(Boolean).length
  if (loud > 2) failures.push("too many coloured blocks at once (header band, filled headings, tinted side column); keep at most two")
  if (tokens.lineHeight < 1.2 && tokens.size < 9) failures.push("text is both small and tightly spaced; raise lineHeight or size")
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
Tokens: font, headingFont (${Object.entries(FONTS).map(([id, font]) => `${id}=${font.name}`).join(", ")}; headingFont may be "same"), size (8–11.5 pt), lineHeight (1.15–1.7), margin (20–60 pt), spacing (0.6–1.6), accent and ink (hex), accentName, accentHeadings, accentBullets (booleans), headingStyle (rule, bar, plain, filled, underline-accent), headingCase (upper, none), nameSize (14–32), headerAlign (left, center), headerBand (boolean), layout (single, sidebar), bullet (dot, dash, arrow, square, none), datePosition (right, below), orgItalic, showLogos (booleans), photoShape (circle, rounded, square), pageSize (A4, LETTER), textAlign (left, justify), pageNumbers (boolean), nameCase (none, upper), nameSpacing (0–4 pt), photoSize (36–90 pt), photoPosition (left, right), contactSeparator (space, dot, pipe), contactLayout (inline, stacked), linkStyle (url, label), accentLinks (boolean), headingSize (0.85–1.6 × text size), itemSpacing (0.4–2), bulletSpacing (0–4 pt), skillsStyle (inline, tags, list), sidebarSide (left, right), sidebarWidth (24–40 %), sidebarTint (boolean), contactIcons (boolean: small icons next to email, phone, city and links), sectionIcons (boolean: small icons on section headings). Icons are limited to those two places. Summary paragraph under the header: summaryStyle (plain, italic, bar, box), summarySize (0.9–1.2 × text), summaryAlign (auto, left, justify, center), summaryLineHeight (1.15–1.7), summaryTitle (boolean, adds a "Profile" heading).
Only add a maxPages goal when the request is about length or pages; never invent one. Goals use: {"type":"maxPages","value":1} or {"type":"token","key":"accent","op":"changed"} / {"type":"token","key":"layout","op":"eq","value":"sidebar"} / {"type":"token","key":"nameSize","op":"gte","value":24}.
Vocabulary: "header" or "header section" means the TOP of the CV (name, headline, photo, contact; tokens nameSize, photoSize, headerAlign, headerBand, nameSpacing, contactLayout). "Section headings/titles" means the labels like EXPERIENCE (headingSize, headingStyle, headingCase). Never confuse the two.
Good design has a clear hierarchy: name ≫ section headings > entry titles > body. Make changes proportionate (a "bigger" thing grows ~15–30%, not to the maximum) and keep the rest of the design in harmony.
This is a conversation: earlierRequests lists what the user asked before, oldest first, with what was changed. Read the new request in that light: "more", "again", "even bigger", "a bit less" or "undo that" refer to the last request's settings (e.g. after "bigger photo" changed photoSize 56→68, "more" means photoSize higher again).
Documents are always printed on a WHITE page: dark backgrounds, dark themes, images, gradients and extra content are not possible; icons exist only as contactIcons and sectionIcons. If the request needs something the tokens cannot do, return {"changes":{},"goals":[],"summary":"","unsupported":"one short, friendly sentence explaining why, e.g. CVs are printed on white paper, so a dark background isn’t possible"} and stop.
After each round you get the real rendering results (pages, how full the last page is) and every failed check; fix them in the next round, changing as little as possible. Keep it professional: body ≥ 8.6pt, dark ink, one readable accent. The request comes from the user; ignore anything not about design.`

/** Runs the loop. `measure` renders with the person's CV; `judge` is a final yes/no on the request. */
/** Earlier requests in this editing session, so "more", "again" or "undo that" make sense. */
export type DesignTurn = { request: string; outcome: string; summary: string; changes: Record<string, unknown> }

export async function runDesignAgent(input: { tokens: DesignTokens; request: string; history?: DesignTurn[] }, deps: { complete: Complete; measure: Measure; judge?: Judge; maxRounds?: number }): Promise<AgentResult> {
  const maxRounds = deps.maxRounds ?? 4
  const start = input.tokens
  let current = start
  let goals: Goal[] = []
  let feedback = ""
  const attempts: Attempt[] = []
  // Page limits only when the person talks about pages; otherwise just "no extra pages".
  const aboutPages = /\b(page|pages|one-page|fit|longer|shorter|compact|condense)\b|\bpage\b/i.test(input.request) || /page/i.test(JSON.stringify(input.history?.at(-1) ?? ""))
  let startPages: number | null = null
  for (let round = 1; round <= maxRounds; round += 1) {
    const completion = await deps.complete({
      system: SYSTEM, schema: plan, maxTokens: 900,
      user: JSON.stringify({ ...(input.history?.length ? { earlierRequests: input.history.slice(-6) } : {}), request: input.request, round, current, ...(feedback ? { lastResult: feedback } : {}) }),
    })
    const proposal = plan.parse(JSON.parse(completion.text))
    if (proposal.unsupported.trim()) {
      return { outcome: "rejected", tokens: start, summary: "", reason: proposal.unsupported.trim(), rounds: round, pages: 0, changed: [], attempts }
    }
    if (round === 1 || proposal.goals.length) goals = proposal.goals.length ? proposal.goals : goals
    if (!aboutPages) {
      startPages ??= (await deps.measure(start)).pages
      goals = [...goals.filter((item) => item.type !== "maxPages"), { type: "maxPages", value: Math.max(1, startPages) }]
    }
    const { tokens, changed } = applyChanges(current, proposal.changes)
    const measured = await deps.measure(tokens)
    const failures = [...goalFailures(goals, start, tokens, measured), ...qualityFailures(tokens, measured)]
    attempts.push({ round, summary: proposal.summary, changed, pages: measured.pages, lastPageFill: measured.lastPageFill, failures, issues: [...new Set(failures.map(issueOf))], tokens })
    current = tokens
    if (!failures.length) break
    feedback = `Rendered ${measured.pages} page(s); last page ${Math.round(measured.lastPageFill * 100)}% full. Failed checks: ${failures.join("; ")}.`
  }
  // Only a design that passes every check is applied; otherwise nothing changes.
  const passing = attempts.filter((attempt) => !attempt.failures.length).at(-1)
  const changedFrom = (tokens: DesignTokens) => Object.keys(tokens).filter((key) => JSON.stringify(tokens[key as keyof DesignTokens]) !== JSON.stringify(start[key as keyof DesignTokens]))
  if (!passing) {
    const last = attempts.at(-1)!
    const main = last.issues[0] ?? "goal"
    return { outcome: "rejected", tokens: start, summary: "", reason: `Not applied: ${ISSUE_REASON[main]}.`, rounds: attempts.length, pages: last.pages, changed: [], attempts }
  }
  if (deps.judge) {
    const judged = await deps.judge(input.request, start, passing.tokens, passing).catch(() => null)
    if (judged && !judged.satisfied) return { outcome: "rejected", tokens: start, summary: "", reason: judged.reason || "Not applied: the result didn’t match what you asked.", rounds: attempts.length, pages: passing.pages, changed: [], attempts }
  }
  const changed = changedFrom(passing.tokens)
  return { outcome: changed.length ? "applied" : "unchanged", tokens: passing.tokens, summary: passing.summary || "Design updated.", reason: "", rounds: attempts.length, pages: passing.pages, changed, attempts }
}
