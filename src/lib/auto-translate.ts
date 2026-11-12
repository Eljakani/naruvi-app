/**
 * What to translate in one profile entry so every CV language has the same
 * content. Pure: entry in, work out.
 *
 * Ownership rule: Naruvi records the exact text it wrote (per field, per line).
 * A value still equal to that text is Naruvi's: it is re-translated when its
 * source changes and removed when its source is gone. Anything else is the
 * user's and is never touched. User text in one language is the source for
 * the others; when two languages both have user text, there is nothing to do.
 */
import { translatedKeys, type EntryKind } from "@/lib/entry-fields"

export type Translations = Record<string, Record<string, { text: string; source: string }>>
export type PlanPhrasing = { id: string; group: string; role: "bullet" | "label"; language: string; text: string; factIds: string[]; sortOrder: number; autoText: string | null; autoSource: string | null }
export type PlanEntry = { kind: string; display: Record<string, Record<string, string>>; translations: Translations; phrasings: PlanPhrasing[] }

/** One model call: everything going from one language to another. */
export type TranslationJob = {
  from: string
  to: string
  /** field → source text */
  text: Record<string, string>
  /** source line → the machine line it replaces (null: a new line) */
  lines: { source: PlanPhrasing; replaces: string | null }[]
}
export type TranslationPlan = { jobs: TranslationJob[]; /** fields Naruvi wrote whose source is gone */ clearFields: { lang: string; key: string }[]; /** machine lines whose source is gone */ deleteLines: string[] }

export const isMachineLine = (line: Pick<PlanPhrasing, "text" | "autoText">) => line.autoText !== null && line.text === line.autoText
const isMachineField = (entry: PlanEntry, lang: string, key: string) => {
  const auto = entry.translations[lang]?.[key]
  return Boolean(auto) && (entry.display[lang]?.[key] ?? "") === auto!.text
}

/** Lines of one group, paired across languages by position ("row" 0, 1, …). */
function rows(phrasings: PlanPhrasing[], langs: readonly string[]) {
  const out: { group: string; byLang: Record<string, PlanPhrasing | undefined> }[] = []
  const groups = [...new Set(phrasings.map((line) => `${line.role}\u0000${line.group}`))]
  for (const id of groups) {
    const [role, group] = id.split("\u0000")
    const lists = Object.fromEntries(langs.map((lang) => [lang, phrasings.filter((line) => line.role === role && line.group === group && line.language === lang && line.text.trim()).sort((a, b) => a.sortOrder - b.sortOrder)]))
    const count = Math.max(0, ...Object.values(lists).map((list) => list.length))
    for (let index = 0; index < count; index++) out.push({ group, byLang: Object.fromEntries(langs.map((lang) => [lang, lists[lang][index]])) })
  }
  return out
}

export function planTranslations(entry: PlanEntry, langs: readonly string[], preferred: string): TranslationPlan {
  const jobs = new Map<string, TranslationJob>()
  const job = (from: string, to: string) => {
    const key = `${from}>${to}`
    if (!jobs.has(key)) jobs.set(key, { from, to, text: {}, lines: [] })
    return jobs.get(key)!
  }
  const pickSource = (owners: string[]) => (owners.includes(preferred) ? preferred : owners[0])
  const clearFields: TranslationPlan["clearFields"] = []
  const deleteLines: string[] = []

  for (const key of translatedKeys(entry.kind as EntryKind)) {
    const value = (lang: string) => entry.display[lang]?.[key]?.trim() ?? ""
    const owners = langs.filter((lang) => value(lang) && !isMachineField(entry, lang, key))
    if (!owners.length) {
      for (const lang of langs) if (value(lang) && isMachineField(entry, lang, key)) clearFields.push({ lang, key })
      continue
    }
    const from = pickSource(owners)
    for (const to of langs) {
      if (owners.includes(to)) continue
      const stale = !value(to) || (isMachineField(entry, to, key) && entry.translations[to][key].source !== value(from))
      if (stale) job(from, to).text[key] = value(from)
    }
  }

  for (const row of rows(entry.phrasings, langs)) {
    const owners = langs.filter((lang) => row.byLang[lang] && !isMachineLine(row.byLang[lang]!))
    if (!owners.length) {
      for (const lang of langs) if (row.byLang[lang]) deleteLines.push(row.byLang[lang]!.id)
      continue
    }
    const source = row.byLang[pickSource(owners)]!
    for (const to of langs) {
      if (owners.includes(to)) continue
      const target = row.byLang[to]
      if (!target || target.autoSource !== source.text) job(source.language, to).lines.push({ source, replaces: target?.id ?? null })
    }
  }

  return { jobs: [...jobs.values()].filter((item) => Object.keys(item.text).length || item.lines.length), clearFields, deleteLines }
}
