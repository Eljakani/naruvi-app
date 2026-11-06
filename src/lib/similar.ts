/**
 * Is this posting one we already have? Pure, language-neutral helpers.
 */

/** Words that say nothing about the role itself: gender markers, contract tags and filler. */
const NOISE = new Set(["f", "h", "m", "w", "d", "x", "fh", "hf", "mwd", "mfd", "all", "genders", "cdi", "cdd", "the", "a", "an", "de", "du", "des", "le", "la", "les", "et", "and", "of", "en", "for", "pour"])

/** "Ingénieur DevSecOps Senior (H/F)" → ["ingenieur", "devsecops", "senior"] */
export function titleWords(title: string): string[] {
  return title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .split(/[^\p{L}\p{N}+#]+/u)
    .filter((word) => word && !NOISE.has(word))
}

/** Overlap of two titles' words, 0–1 (Jaccard). */
export function titleSimilarity(a: string, b: string): number {
  const left = new Set(titleWords(a))
  const right = new Set(titleWords(b))
  if (!left.size || !right.size) return 0
  let shared = 0
  for (const word of left) if (right.has(word)) shared += 1
  return shared / (left.size + right.size - shared)
}

export const SAME_ROLE = 0.6

/** Tags as people type them: trimmed, single spaces, no duplicates (case-insensitive), at most 12. */
export function cleanTags(tags: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of tags) {
    const tag = raw.replace(/\s+/g, " ").trim().slice(0, 40)
    const key = tag.toLowerCase()
    if (!tag || seen.has(key)) continue
    seen.add(key)
    out.push(tag)
    if (out.length === 12) break
  }
  return out
}
