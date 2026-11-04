/**
 * Grounding checks — pure functions, no I/O.
 *
 * A phrasing (or any generated bullet) is grounded when every number it states
 * appears in at least one supporting fact, and it is linked to the facts it
 * paraphrases. This is the deterministic half of "grounded by construction";
 * generation (step 5) reuses the same checks on model output.
 */

export type FactLike = { id: string; statement: string }

const STOPWORDS = new Set(
  "a an and the of to in for with on at by from as is are was were be been into over across per via using use used de la le les des du et en pour avec sur un une au aux par dans".split(" "),
)

/** Numbers as written, normalized: "$3,600" → "3600", "66%" → "66%", "50+" → "50". */
export function extractNumbers(text: string): string[] {
  const out = new Set<string>()
  for (const match of String(text).matchAll(/(\d[\d,.\s]*\d|\d)(\s?%)?/g)) {
    const digits = match[1].replace(/[,\s]/g, "").replace(/\.(?=\d{3}\b)/g, "")
    if (/^(19|20)\d{2}$/.test(digits)) continue // years are dates, not claims
    if (!match[2] && /^(1(st|re|er)|first)/i.test(String(text).slice((match.index ?? 0) + match[1].length - 1, (match.index ?? 0) + match[1].length + 3).replace(/^\d/, "1"))) continue // "1st place" is a rank
    out.add(match[2] ? `${digits}%` : digits)
  }
  return [...out]
}

function tokens(text: string): Set<string> {
  return new Set(
    String(text)
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/\*\*/g, "")
      .match(/[a-z0-9][a-z0-9+#.-]*/g)
      ?.filter((word) => word.length > 2 && !STOPWORDS.has(word)) ?? [],
  )
}

function overlap(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0
  let shared = 0
  for (const word of a) if (b.has(word)) shared += 1
  return shared / Math.min(a.size, b.size)
}

export type Support = {
  factIds: string[]
  /** Numbers in the text that no linked fact contains. */
  unsupportedNumbers: string[]
  grounded: boolean
}

/**
 * Link a phrasing to the facts that support it. A fact supports it when it
 * shares a number, or enough vocabulary (works across EN/FR for tool names,
 * acronyms and numbers; pure-prose translations may need a manual link).
 */
export function supportFor(text: string, facts: FactLike[], minOverlap = 0.34): Support {
  const numbers = extractNumbers(text)
  const words = tokens(text)
  const linked = new Set<string>()
  for (const fact of facts) {
    const factNumbers = extractNumbers(fact.statement)
    if (numbers.some((n) => factNumbers.includes(n))) linked.add(fact.id)
    else if (overlap(words, tokens(fact.statement)) >= minOverlap) linked.add(fact.id)
  }
  return verifySupport(text, facts.filter((fact) => linked.has(fact.id)))
}

/** Check a text against an explicit set of supporting facts. */
export function verifySupport(text: string, supporting: FactLike[]): Support {
  const available = new Set(supporting.flatMap((fact) => extractNumbers(fact.statement)))
  const unsupportedNumbers = extractNumbers(text).filter((n) => !available.has(n))
  return {
    factIds: supporting.map((fact) => fact.id),
    unsupportedNumbers,
    grounded: supporting.length > 0 && unsupportedNumbers.length === 0,
  }
}

export type RankedFact = { id: string; score: number; sharedNumbers: string[] }

/**
 * Rank facts by how likely they support a text: shared numbers weigh most,
 * then vocabulary overlap. Used to pre-select suggestions in the review queue.
 */
export function rankFacts(text: string, facts: FactLike[]): RankedFact[] {
  const numbers = extractNumbers(text)
  const words = tokens(text)
  return facts
    .map((fact) => {
      const sharedNumbers = extractNumbers(fact.statement).filter((n) => numbers.includes(n))
      const score = sharedNumbers.length * 2 + overlap(words, tokens(fact.statement))
      return { id: fact.id, score: Number(score.toFixed(3)), sharedNumbers }
    })
    .sort((a, b) => b.score - a.score)
}
