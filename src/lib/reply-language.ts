import type { Locale } from "@/i18n/config"

/**
 * Which language to answer in: the language of the user's own words, not of
 * the data (postings, emails and job titles are often in another language).
 * Script and common words identify the language; ambiguous text uses the fallback.
 */
const MARKERS: Record<string, { name: string; words: string[] }> = {
  ar: { name: "Arabic", words: [] },
  fr: { name: "French", words: ["je", "tu", "vous", "les", "des", "une", "est", "pour", "avec", "pas", "mon", "mes", "quoi", "quelle", "quelles", "comment", "pourquoi", "candidature", "entreprise", "merci", "bonjour", "et", "le", "la", "du", "sur", "dans", "ajoute", "ajouter", "peux"] },
  es: { name: "Spanish", words: ["yo", "usted", "los", "las", "una", "para", "con", "qué", "cómo", "porque", "empresa", "gracias", "hola", "el", "la", "del", "por", "mis", "mi", "tengo", "tienes", "puedes", "añade", "y", "muy"] },
  de: { name: "German", words: ["ich", "du", "sie", "der", "die", "das", "und", "mit", "für", "nicht", "eine", "meine", "bitte", "danke", "wie", "warum", "firma", "bewerbung", "kannst"] },
  en: { name: "English", words: ["i", "you", "the", "a", "an", "and", "for", "with", "not", "my", "what", "which", "how", "why", "please", "thanks", "is", "are", "can", "add", "to", "of", "do", "should"] },
}

export function replyLanguage(text: string, fallback: Locale = "en"): { code: string; name: string } {
  const words = text.replace(/https?:\/\/\S+/gi, "").toLowerCase().normalize("NFC").match(/[\p{L}\p{M}']+/gu) ?? []
  let best: { code: string; score: number } = { code: fallback, score: 0 }
  for (const [code, { words: markers }] of Object.entries(MARKERS)) {
    const score = words.filter((word) => code === "ar" ? /\p{Script=Arabic}/u.test(word) : markers.includes(word)).length
    if (score > best.score) best = { code, score }
  }
  const code = best.code !== "ar" && best.code !== "en" && best.score < 2 && words.length > 2 ? fallback : best.code
  return { code, name: MARKERS[code].name }
}
