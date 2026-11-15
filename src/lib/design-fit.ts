/**
 * Fits a design to a page count by tightening (or loosening) the things a
 * person would adjust by hand: text size, line height, margins and gaps. It
 * never leaves the readable range, and it measures real renders, so the
 * answer is the loosest design that fits rather than a guess.
 */
import { designTokens, type DesignTokens } from "./design"

type Numeric = "size" | "lineHeight" | "margin" | "spacing" | "itemSpacing" | "bulletSpacing" | "summaryLineHeight"
/** The tightest values that still read well on paper. */
export const FIT_FLOOR: Record<Numeric, number> = { size: 8.8, lineHeight: 1.24, margin: 24, spacing: 0.7, itemSpacing: 0.6, bulletSpacing: 0.5, summaryLineHeight: 1.24 }
/** The loosest values before a page starts to look empty. */
export const FIT_CEILING: Record<Numeric, number> = { size: 10.6, lineHeight: 1.5, margin: 46, spacing: 1.3, itemSpacing: 1.3, bulletSpacing: 2.5, summaryLineHeight: 1.5 }
const STEP: Record<Numeric, number> = { size: 0.05, lineHeight: 0.01, margin: 1, spacing: 0.05, itemSpacing: 0.05, bulletSpacing: 0.25, summaryLineHeight: 0.01 }

/**
 * amount > 0 tightens towards the floor, < 0 loosens towards the ceiling; 1 and -1 reach them.
 * A value already past its limit is left alone: fitting never undoes a deliberate choice.
 */
export function scaleDesign(tokens: DesignTokens, amount: number): DesignTokens {
  const k = Math.max(-1, Math.min(1, amount))
  const out: Record<string, unknown> = { ...tokens }
  for (const key of Object.keys(STEP) as Numeric[]) {
    const value = tokens[key]
    const target = k >= 0 ? Math.min(value, FIT_FLOOR[key]) : Math.max(value, FIT_CEILING[key])
    const next = value + (target - value) * Math.abs(k)
    out[key] = Number((Math.round(next / STEP[key]) * STEP[key]).toFixed(2))
  }
  // The name shrinks with the text, a little, so the hierarchy holds.
  if (k > 0) out.nameSize = Math.max(Math.round(tokens.nameSize * (1 - 0.12 * k)), Math.ceil((out.size as number) + 5), 14)
  return designTokens.parse(out)
}

export type FitMeasure = (tokens: DesignTokens) => Promise<{ pages: number; lastPageFill: number }>
export type FitResult = {
  tokens: DesignTokens
  pages: number
  lastPageFill: number
  /** Whether the result is within the page target. */
  fits: boolean
  direction: "tightened" | "loosened" | "none"
  changed: string[]
  renders: number
}

const changedKeys = (before: DesignTokens, after: DesignTokens) => Object.keys(after).filter((key) => JSON.stringify(after[key as keyof DesignTokens]) !== JSON.stringify(before[key as keyof DesignTokens]))

/**
 * Over the target: the least tightening that fits (at most `maxTighten`).
 * Within it with room to spare: the most loosening that adds no page, so the page looks full.
 */
export async function fitDesign(tokens: DesignTokens, targetPages: number, measure: FitMeasure, options: { fill?: boolean; maxTighten?: number } = {}): Promise<FitResult> {
  const maxTighten = options.maxTighten ?? 1
  let renders = 1
  const start = await measure(tokens)
  const done = (next: DesignTokens, measured: { pages: number; lastPageFill: number }, direction: FitResult["direction"]): FitResult =>
    ({ tokens: next, pages: measured.pages, lastPageFill: measured.lastPageFill, fits: measured.pages <= targetPages, direction: changedKeys(tokens, next).length ? direction : "none", changed: changedKeys(tokens, next), renders })
  const search = async (from: number, to: number, ok: (measured: { pages: number }) => boolean) => {
    // `to` is known to satisfy `ok`; find the point closest to `from` that still does.
    let low = from, high = to
    let best = { tokens: scaleDesign(tokens, to), measured: await measure(scaleDesign(tokens, to)) }
    renders += 1
    if (!ok(best.measured)) return null
    for (let step = 0; step < 4; step += 1) {
      const middle = (low + high) / 2
      const candidate = scaleDesign(tokens, middle)
      const measured = await measure(candidate)
      renders += 1
      if (ok(measured)) { best = { tokens: candidate, measured }; high = middle } else low = middle
    }
    return best
  }
  if (start.pages > targetPages) {
    const found = await search(0, maxTighten, (measured) => measured.pages <= targetPages)
    if (found) return done(found.tokens, found.measured, "tightened")
    // Not reachable by layout alone: report the tightest allowed, the caller decides what to cut.
    const tightest = scaleDesign(tokens, maxTighten)
    const measured = await measure(tightest)
    renders += 1
    return done(tightest, measured, "tightened")
  }
  if (options.fill !== false && start.lastPageFill < 0.82) {
    // Loosening searches the other way: the most generous design that keeps the page count.
    let low = 0, high = -1
    let best: { tokens: DesignTokens; measured: { pages: number; lastPageFill: number } } | null = null
    for (let step = 0; step < 5; step += 1) {
      const middle = step === 0 ? high : (low + high) / 2
      const candidate = scaleDesign(tokens, middle)
      const measured = await measure(candidate)
      renders += 1
      if (measured.pages <= start.pages) {
        best = { tokens: candidate, measured }
        if (step === 0) break
        low = middle
      } else high = middle
    }
    if (best) return done(best.tokens, best.measured, "loosened")
  }
  return done(tokens, start, "none")
}
