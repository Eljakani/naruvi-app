/**
 * Reads the level a CV gives for a spoken language ("courant", "C1",
 * "Muttersprache", "professional working proficiency", "TOEIC 945") into the
 * profile's scale (native, C2…A1) and the test it names. Pure. A wording that
 * says nothing about level gives no level: it is never guessed.
 */

export type LanguageLevel = "native" | "C2" | "C1" | "B2" | "B1" | "A2" | "A1"

const fold = (value: string) => value.normalize("NFKD").replace(/[\u0300-\u036f\u064b-\u0655]/g, "").toLowerCase().replace(/[’']/g, " ").replace(/\s+/g, " ").trim()

/** Wordings in English, French, Spanish, German, Italian, Portuguese, Dutch and Arabic. First match wins: longer, more specific wordings come first. */
// Arabic wordings below use a bare alef: `fold` drops the hamza, so "الأم" and "الام" both match.
const WORDINGS: [RegExp, LanguageLevel][] = [
  [/\b(?:native or bilingual|native|mother tongue|first language|bilingual|bilingue|langue maternelle|maternelle|natif|native speaker|muttersprach\w*|erstsprache|zweisprachig|lengua materna|lengua nativa|nativ[oa]|matern[oa]|madrelingua|lingua madre|lingua materna|moedertaal|tweetalig)\b|اللغة الام|لغة الام|لغة ام|الام/, "native"],
  [/\b(?:limited working|limited proficiency|competence professionnelle limitee)\b/, "B1"],
  [/\b(?:full professional|competence professionnelle complete|capacidad profesional completa|verhandlungssicher|business fluent|near[- ]native|quasi[- ]bilingue)\b/, "C1"],
  [/\b(?:professional working|competence professionnelle|capacidad profesional|upper[- ]intermediate|intermediaire avance|intermediaire superieur|intermedio alto|intermedio avanzado|gute kenntnisse|gut in wort und schrift|fortgeschrittene kenntnisse)\b/, "B2"],
  [/\b(?:elementary|competence elementaire|notions de base|grundkenntnisse|basiskenntnisse|schulkenntnisse|niveau scolaire|scolaire|pre[- ]intermediate|conocimientos basicos|nivel basico|conoscenza di base|basiskennis)\b/, "A2"],
  [/\b(?:proficient|proficiency|mastery|maitrise parfaite|perfekt|dominio completo)\b/, "C2"],
  [/\b(?:fluent|fluently|courant|couramment|lu ecrit parle|fliessend|fliesend|fließend|sehr gut|fluido|fluida|fluidez|fluente|scorrevole|vloeiend|advanced|avance|avancee|avanzado|avanzada|avanzato|avancado|fortgeschritten|excellent|tres bon niveau|ottimo)\b|بطلاقة|طلاقة|متقدم|ممتاز|جيد جدا/, "C1"],
  [/\b(?:intermediate|intermediaire|conversational|conversationnel|working knowledge|intermedio|intermedia|mittelstufe|mittel|moyen|medio|intermediario)\b|متوسط/, "B1"],
  [/\b(?:professional|professionnel|professionnelle|operationnel|bon niveau|good|gut|buono|bueno|bom|competent|independent|profesional)\b|جيد/, "B2"],
  [/\b(?:basic|basics|notions|basique|basico|basica|base|elementare|elementaire)\b|اساسي|مبادئ/, "A2"],
  [/\b(?:beginner|debutant|debutante|principiante|anfanger|anfaenger|iniciante|beginner level)\b|مبتدئ/, "A1"],
]
const TEST = /\b(?:TOEIC|TOEFL(?:\s+iBT)?|IELTS|Cambridge(?:\s+(?:English|Advanced|Proficiency|First|C[12]\s+\w+))?|FCE|CAE|CPE|Linguaskill|BULATS|Duolingo(?:\s+English\s+Test)?|DELF|DALF|TCF|TEF|DELE|SIELE|Goethe[- ]Zertifikat|Goethe|TestDaF|DSH|telc|ÖSD|CELI|CILS|PLIDA|CELPE[- ]Bras|JLPT|HSK|TOPIK)\b(?:[ :\-–]*(?:[ABC][12]|N[1-5]|\d{1,3}(?:[.,]\d)?(?:\s*\/\s*\d{1,3})?))?/i

export function readLanguageLevel(text: string): { level?: LanguageLevel; test?: string } {
  const test = text.match(TEST)?.[0].replace(/\s+/g, " ").trim()
  const explicit = text.match(/(?<![\p{L}\p{N}])([ABC][12])(?![\p{L}\p{N}])/u)?.[1] as LanguageLevel | undefined
  if (explicit) return { level: explicit, ...(test ? { test } : {}) }
  const plain = fold(text)
  const level = WORDINGS.find(([pattern]) => pattern.test(plain))?.[1]
  return { ...(level ? { level } : {}), ...(test ? { test } : {}) }
}

/** "Anglais — courant (TOEIC 945)" → { name: "Anglais", rest: "courant (TOEIC 945)" }. */
export function splitLanguageItem(item: string): { name: string; rest: string } {
  const text = item.replace(/^[\s•*-]+/, "").trim()
  const match = text.match(/^([^:()–—|/\-]+?)\s*(?:[:(–—|/]|\s-\s|\s{3,})\s*(.*)$/)
  if (match) return { name: match[1].trim(), rest: match[2].replace(/\)\s*$/, "").trim() }
  // "English fluent", "Deutsch Muttersprache": the first word is the language.
  const [name, ...rest] = text.split(/\s+/)
  return rest.length && readLanguageLevel(rest.join(" ")).level ? { name, rest: rest.join(" ") } : { name: text, rest: "" }
}
