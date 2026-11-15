/**
 * Tells when a line is plainly written in another language than its document.
 * Pure and deliberately cautious: it counts everyday function words ("the",
 * "des", "und"…), which tool names, titles and places do not contain, and
 * only speaks when another language clearly beats the expected one. A line it
 * cannot judge (a list of tools, a name) is never called foreign.
 */

const WORDS: Record<string, string> = {
  en: "the and of to in with for on at by from as is are was were that this which using across through into their our its has have had been be while within including used built led new",
  fr: "le la les de des du et en un une dans pour par avec sur au aux à ce cette ces est sont qui que ou où mais sa ses leur leurs notre nos mon mes chez afin ainsi entre vers sous été être ont sein",
  es: "el la los las de del y en un una con para por que es son como su sus al se más entre sobre desde hasta también",
  de: "der die das und von mit für in im den dem des ein eine einer zu zur zum auf ist sind bei als auch wurde durch sowie nach über unter aus an am",
}
const LISTS = Object.entries(WORDS).map(([lang, words]) => [lang, new Set(words.split(" "))] as const)
/** French elisions: d'équipe, l'outil, qu'il… */
const ELISION = /(?<!\p{L})(?:d|l|qu|n|j|c)['’](?=\p{L})/giu
const ARABIC = /\p{Script=Arabic}/gu
const KNOWN = new Set([...Object.keys(WORDS), "ar"])

function evidence(text: string): Record<string, number> {
  const value = text.normalize("NFC").toLowerCase()
  const tokens = value.match(/\p{L}+/gu) ?? []
  const counts: Record<string, number> = Object.fromEntries(LISTS.map(([lang]) => [lang, 0]))
  for (const token of tokens) for (const [lang, list] of LISTS) if (list.has(token)) counts[lang] += 1
  counts.fr += value.match(ELISION)?.length ?? 0
  const letters = value.match(/\p{L}/gu)?.length ?? 0
  const arabic = value.match(ARABIC)?.length ?? 0
  // Arabic has no word list: a line mostly in its script is Arabic.
  counts.ar = letters && arabic / letters > 0.5 ? 99 : 0
  return counts
}

/**
 * The language a line is clearly written in when that is not `expected`, else
 * null. Null also when `expected` is a language this cannot judge.
 */
export function foreignLanguage(text: string, expected: string): string | null {
  if (!KNOWN.has(expected) || !text.trim()) return null
  const counts = evidence(text)
  const own = counts[expected] ?? 0
  const [best, hits] = Object.entries(counts).filter(([lang]) => lang !== expected).sort((a, b) => b[1] - a[1])[0]
  return hits >= 2 && hits >= own + 2 ? best : null
}

/** Whether a line may be printed in a document written in `expected`. */
export const inLanguage = (text: string, expected: string) => foreignLanguage(text, expected) === null
