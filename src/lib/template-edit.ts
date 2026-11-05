import type { DesignTokens } from "./design"

/** Apply only proposed fields which the person has not edited in the meantime. */
export function mergeDesignChanges(before: DesignTokens, current: DesignTokens, changes: Partial<DesignTokens>): DesignTokens {
  const accepted = Object.fromEntries(Object.entries(changes).filter(([key]) => {
    const field = key as keyof DesignTokens
    return JSON.stringify(current[field]) === JSON.stringify(before[field])
  }))
  return { ...current, ...accepted }
}

/** Bounded fitting preserves content and never goes below the readability floor. */
export async function fitDesignToPage(tokens: DesignTokens, measure: (tokens: DesignTokens) => Promise<number>) {
  let best = tokens
  let pages = await measure(best)
  const attempts = [
    { size: 9.4, lineHeight: 1.28, margin: 30, spacing: 0.85 },
    { size: 9, lineHeight: 1.2, margin: 24, spacing: 0.7 },
    { size: 8.6, lineHeight: 1.15, margin: 20, spacing: 0.6 },
  ]
  for (const limits of attempts) {
    if (pages <= 1) break
    const candidate = {
      ...best,
      size: Math.max(8.6, Math.min(best.size, limits.size)),
      lineHeight: Math.min(best.lineHeight, limits.lineHeight),
      margin: Math.min(best.margin, limits.margin),
      spacing: Math.min(best.spacing, limits.spacing),
    }
    const count = await measure(candidate)
    if (count < pages) { best = candidate; pages = count }
  }
  return { tokens: best, pages, fitted: pages <= 1 }
}
