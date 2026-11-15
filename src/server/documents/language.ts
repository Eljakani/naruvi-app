/**
 * One language per document. Pure.
 *
 * The composer only takes text filed under the document's language
 * (compose.ts); this is the net behind it for everything written afterwards
 * (AI tailoring, the content agent, manual edits): it finds printed lines that
 * read as another language, removes them from a generated document, and
 * reports them on the Checks tab.
 */
import { foreignLanguage, inLanguage } from "@/lib/text-language"
import type { CvDocument } from "./model"
import type { LetterDocument } from "./letter"

export type ForeignLine = { where: string; text: string; language: string }

const NAMES: Record<string, string> = { en: "English", fr: "French", es: "Spanish", de: "German", ar: "Arabic" }
const nameOf = (code: string) => NAMES[code] ?? code.toUpperCase()

function collect(lines: { where: string; text: string }[], language: string): ForeignLine[] {
  return lines.flatMap(({ where, text }) => {
    const found = foreignLanguage(text, language)
    return found ? [{ where, text, language: found }] : []
  })
}

/** Printed CV lines that read as another language than the CV's. */
export function foreignCvLines(doc: CvDocument): ForeignLine[] {
  const lines = [{ where: "Headline", text: doc.header.headline }, { where: "Summary", text: doc.header.summary }]
  for (const section of doc.sections.filter((section) => section.included)) {
    for (const item of section.items.filter((item) => item.included)) {
      lines.push({ where: item.title, text: item.title })
      for (const bullet of item.bullets.filter((bullet) => bullet.included)) lines.push({ where: item.title, text: bullet.text })
    }
    for (const group of section.groups) lines.push({ where: section.title, text: group.label })
  }
  return collect(lines, doc.language)
}

/** Printed letter paragraphs that read as another language than the letter's. */
export function foreignLetterLines(doc: LetterDocument): ForeignLine[] {
  const lines = [{ where: "Subject", text: doc.subject }]
  for (const paragraph of doc.paragraphs.filter((paragraph) => paragraph.included)) {
    if (paragraph.kind === "highlights") lines.push(...doc.highlights.filter((h) => h.included).map((h) => ({ where: "Highlights", text: h.text })))
    else lines.push({ where: paragraph.kind, text: paragraph.text })
  }
  return collect(lines, doc.language)
}

/** The Checks-tab entry: fails while any printed line is in another language. */
export function languageCheck(lines: ForeignLine[], language: string) {
  const quote = (text: string) => `“${text.slice(0, 70)}${text.length > 70 ? "…" : ""}”`
  const others = [...new Set(lines.map((line) => nameOf(line.language)))].join(", ")
  return {
    id: "language",
    status: lines.length ? ("fail" as const) : ("pass" as const),
    label: "One language throughout",
    detail: lines.length
      ? `${lines.length} line(s) read as ${others} in this ${nameOf(language)} document: ${lines.slice(0, 3).map((line) => quote(line.text)).join("; ")}. Rewrite them in ${nameOf(language)}, or translate the entry in your profile and regenerate.`
      : `Every line is in ${nameOf(language)}.`,
  }
}

/**
 * A generated CV with every line in another language taken out: a rewrite goes
 * back to its original wording when that is in the right language, otherwise
 * the line is dropped (an entry left with no lines or a foreign title is
 * dropped too and listed in `missingTranslations`). Returns the same object
 * when nothing had to change.
 */
export function keepCvLanguage(doc: CvDocument): { doc: CvDocument; removed: number } {
  const ok = (text: string) => inLanguage(text, doc.language)
  const next = structuredClone(doc)
  let removed = 0
  if (!ok(next.header.headline)) { next.header.headline = ""; removed += 1 }
  if (!ok(next.header.summary)) { next.header.summary = next.header.summaryOriginal && ok(next.header.summaryOriginal) ? next.header.summaryOriginal : ""; removed += 1 }
  for (const section of next.sections) {
    section.items = section.items.flatMap((item) => {
      const had = item.bullets.length
      item.bullets = item.bullets.flatMap((bullet) => {
        if (ok(bullet.text)) return [bullet]
        removed += 1
        if (!bullet.originalText || !ok(bullet.originalText)) return []
        return [{ ...bullet, text: bullet.originalText, originalText: undefined, source: bullet.phrasingId ? ("phrasing" as const) : ("fact" as const) }]
      })
      if (ok(item.title) && (item.bullets.length || !had)) return [item]
      if (!ok(item.title)) removed += 1
      if (!next.missingTranslations.some((missing) => missing.entryId === item.entryId)) next.missingTranslations.push({ entryId: item.entryId, title: item.title })
      return []
    })
    const groups = section.groups.filter((group) => ok(group.label))
    removed += section.groups.length - groups.length
    section.groups = groups
  }
  next.sections = next.sections.filter((section) => section.items.length || section.groups.length)
  return removed ? { doc: next, removed } : { doc, removed: 0 }
}
