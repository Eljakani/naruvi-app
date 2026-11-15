/**
 * Checks what an import read against the CV it came from. Pure. A model
 * structures the text; it must not complete it: an address, a link, a month
 * or a language level stays only when the CV really gives it.
 */
import { parseDateRange, type DateRange } from "@/lib/date-range"
import { fromRange, type DatesValue } from "@/lib/entry-fields"
import { isTitleLine } from "@/lib/cv-sections"
import { readLanguageLevel } from "@/lib/language-level"

export type SourceLink = { text: string; url: string }
export type Identity = { fullName: string; headline: string; summary: string; email: string; phone: string; location: string; links: { label: string; url: string }[] }

const fold = (value: string) => value.normalize("NFKD").replace(/[\u0300-\u036f\u064b-\u0655]/g, "").toLowerCase()
const words = (value: string) => fold(value).split(/[^\p{L}\p{N}+#]+/u).filter((word) => word.length >= 2)

/* ------------------------------------------------------------------ links */

const URL_IN_TEXT = /\b(?:https?:\/\/|www\.)[^\s<>"'()]+|\b(?:[a-z0-9-]+\.)+(?:com|org|net|io|dev|me|co|fr|de|es|it|uk|ma|se|ch|be|nl|pt|ca|eu|app|ai|tech|info|edu|gov|page|site|xyz)(?:\/[^\s<>"'()]*)?/gi
const EMAIL = /[\p{L}\p{N}._%+-]+@[\p{L}\p{N}.-]+\.\p{L}{2,}/gu
const EMAIL_ONE = new RegExp(EMAIL.source, "u")
/** Host and path only: "https://www.GitHub.com/me/" and "github.com/me" are the same address. */
export const linkKey = (url: string) => url.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/[/?#.,;]+$/, "")
const withProtocol = (url: string) => (/^https?:\/\//i.test(url) ? url : `https://${url.replace(/^\/+/, "")}`)

/** Every address the CV gives: written in its text, or attached to a word or icon. */
export function sourceLinks(text: string, links: SourceLink[]): string[] {
  const emails = new Set((text.match(EMAIL) ?? []).map((email) => email.toLowerCase()))
  const inText = (text.match(URL_IN_TEXT) ?? []).map((url) => url.replace(/[.,;:]+$/, "")).filter((url) => ![...emails].some((email) => email.endsWith(url.toLowerCase())))
  const all = [...links.map((link) => link.url).filter((url) => /^https?:/i.test(url)), ...inText.map(withProtocol)]
  const seen = new Set<string>()
  return all.filter((url) => !seen.has(linkKey(url)) && (seen.add(linkKey(url)), true))
}

/**
 * The CV's own address for a link the model returned, or null when the CV
 * has no such address. A shortened address is completed from the CV; one
 * that isn't there at all (built from a name) is dropped.
 */
export function groundLink(url: string, allowed: string[]): string | null {
  const key = linkKey(url)
  if (!key) return null
  const exact = allowed.find((item) => linkKey(item) === key)
  if (exact) return exact
  const longer = allowed.filter((item) => linkKey(item).startsWith(key) && key.includes("."))
  return longer.length === 1 ? longer[0] : null
}

const HOST_LABELS: [RegExp, string][] = [
  [/(^|\.)linkedin\.com$/, "LinkedIn"], [/(^|\.)github\.com$/, "GitHub"], [/(^|\.)gitlab\.com$/, "GitLab"], [/(^|\.)behance\.net$/, "Behance"], [/(^|\.)dribbble\.com$/, "Dribbble"],
  [/(^|\.)medium\.com$/, "Medium"], [/(^|\.)stackoverflow\.com$/, "Stack Overflow"], [/(^|\.)kaggle\.com$/, "Kaggle"], [/(^|\.)orcid\.org$/, "ORCID"], [/scholar\.google\./, "Google Scholar"],
  [/(^|\.)researchgate\.net$/, "ResearchGate"], [/(^|\.)(twitter|x)\.com$/, "X"], [/(^|\.)bitbucket\.org$/, "Bitbucket"], [/(^|\.)huggingface\.co$/, "Hugging Face"],
]
const hostOf = (url: string) => {
  try {
    return new URL(withProtocol(url)).hostname.replace(/^www\./, "").toLowerCase()
  } catch {
    return ""
  }
}
/** A person's page on a profile site, not a repository or a post under it: "github.com/me", not "github.com/me/project". */
const profilePage = (url: string) => Boolean(profileSite(url)) && (/GitHub|GitLab|Bitbucket|Hugging Face/.test(profileSite(url)!) ? linkKey(url).split("/").length === 2 : linkKey(url).includes("/"))
/** "LinkedIn", "GitHub"… for a profile site, else null. */
export const profileSite = (url: string) => HOST_LABELS.find(([pattern]) => pattern.test(hostOf(url)))?.[1] ?? null

/* ------------------------------------------------------------------ identity */

const PHONE = /(?:\+|00)?\(?\d[\d\s().\-‑/]{6,}\d/g
const digits = (value: string) => value.replace(/\D/g, "")
const grounded = (value: string, source: Set<string>, share = 0.7) => {
  const list = words(value)
  return list.length > 0 && list.filter((word) => source.has(word)).length / list.length >= share
}

/** Phone numbers in the text: 8 to 15 digits, not a span of years or a date. */
export function phonesIn(text: string): string[] {
  return (text.match(PHONE) ?? []).map((value) => value.trim()).filter((value) => {
    const count = digits(value).length
    return count >= 8 && count <= 15 && !/^(?:19|20)\d{2}\s*[-–/]\s*(?:19|20)\d{2}$/.test(value) && !/^\d{1,2}[./]\d{1,2}[./]\d{2,4}$/.test(value)
  })
}

/**
 * The identity with only what the CV supports: the address and number are
 * the CV's own, a link is kept when the CV has it (and the CV's hidden
 * profile links are added), and a name, headline or place not in the text
 * is cleared.
 */
export function groundIdentity(identity: Identity, text: string, links: SourceLink[]): Identity {
  const source = new Set(words(text))
  const top = text.split(/\r?\n/).filter((line) => line.trim()).slice(0, 14).join("\n")
  const emails = [...(text.match(EMAIL) ?? []), ...links.filter((link) => /^mailto:/i.test(link.url)).map((link) => link.url.replace(/^mailto:/i, "").split("?")[0])]
  const email = emails.find((item) => item.toLowerCase() === identity.email.trim().toLowerCase()) ?? emails[0] ?? ""
  const phones = phonesIn(text)
  const wanted = digits(identity.phone)
  const phone = phones.find((item) => wanted.length >= 7 && (digits(item) === wanted || digits(item).endsWith(wanted) || wanted.endsWith(digits(item)))) ?? phonesIn(top)[0] ?? ""
  const allowed = sourceLinks(text, links)
  const kept: { label: string; url: string }[] = []
  const add = (label: string, url: string) => {
    if (!kept.some((link) => linkKey(link.url) === linkKey(url))) kept.push({ label: (profileSite(url) ?? label.trim()) || "Website", url })
  }
  for (const link of identity.links) {
    const url = groundLink(link.url, allowed)
    if (url) add(link.label, url)
  }
  // Links behind a word or an icon: profile sites, and anything linked from the top of the page.
  for (const link of links) {
    if (!/^https?:/i.test(link.url)) continue
    if (profilePage(link.url) || (link.text && top.includes(link.text))) add(link.text && !/[./]/.test(link.text) ? link.text : "", link.url)
  }
  // Addresses written in the text that the model left out: profile pages anywhere, and a personal site at the top of the page.
  for (const url of allowed) if (profilePage(url) || top.toLowerCase().includes(linkKey(url))) add("", url)
  return {
    fullName: grounded(identity.fullName, source, 1) ? identity.fullName : "",
    headline: grounded(identity.headline, source) ? identity.headline : "",
    summary: grounded(identity.summary, source, 0.85) ? identity.summary : "",
    email, phone,
    location: grounded(identity.location, source) ? identity.location : "",
    links: kept.slice(0, 10),
  }
}

/* ------------------------------------------------------------------ dates */

const hasYear = (text: string, year: string) => new RegExp(`(?<!\\d)${year}(?!\\d)`).test(text)
const yearsOf = (value: DatesValue) => [value.start, value.end].filter((point): point is string => Boolean(point) && point !== "present").map((point) => point.slice(0, 4))
/** Whether a date as written names a month ("mars 2022", "03/2022", "2022-03") rather than a year or a season. */
export function namesMonth(text: string): boolean {
  if (/(?<!\d)(?:0?[1-9]|1[0-2])\s*[/.-]\s*(?:19|20)\d{2}(?!\d)|(?<!\d)(?:19|20)\d{2}[-/.](?:0[1-9]|1[0-2])(?!\d)/.test(text)) return true
  return text.split(/[\s,.\-–—/()]+/).some((word) => word.length >= 3 && !/\d/.test(word) && parseDateRange(`${word} 2000`)?.start?.month != null)
}

/**
 * The dates of an entry, from how the CV writes them. `written` is the date
 * text the model copied; when it can be read it wins over the model's own
 * reading. Otherwise the model's dates are kept without months the text
 * doesn't name, and dropped when their years aren't in the CV at all.
 */
export function groundDates(model: unknown, written: string, source: string): DatesValue | undefined {
  const parsed: DateRange | null = written.trim() ? parseDateRange(written.replace(/[()]/g, " ")) : null
  if (parsed?.start) {
    const value = fromRange(parsed)
    if (yearsOf(value).every((year) => hasYear(source, year))) return { ...(value.start ? { start: value.start } : {}), ...(value.end ? { end: value.end } : {}) }
  }
  const fromModel: DatesValue | null = typeof model === "string" ? ((range) => (range?.start ? fromRange(range) : null))(parseDateRange(model)) : model && typeof model === "object" ? (model as DatesValue) : null
  if (!fromModel || (!fromModel.start && !fromModel.end)) return undefined
  const shape = (point: string | undefined) => (point && /^(19|20)\d{2}(-(0[1-9]|1[0-2]))?$/.test(point) ? point : undefined)
  let value: DatesValue = { start: shape(fromModel.start), end: fromModel.end === "present" ? "present" : shape(fromModel.end) }
  if (!yearsOf(value).length || !yearsOf(value).every((year) => hasYear(source, year))) return undefined
  // "été 2024" is 2024, not June 2024.
  if (written.trim() && !namesMonth(written)) value = { start: value.start?.slice(0, 4), end: value.end === "present" ? "present" : value.end?.slice(0, 4) }
  return value.start || value.end ? { ...(value.start ? { start: value.start } : {}), ...(value.end ? { end: value.end } : {}) } : undefined
}

/** A single month ("issued", "date") from the same rules; `end` is the second point when the text gives a span. */
export function groundMonth(model: unknown, written: string, source: string): { point?: string; end?: string } {
  const value = groundDates(typeof model === "string" || (model && typeof model === "object") ? model : undefined, written, source)
  if (!value) return {}
  return { point: value.start ?? (value.end !== "present" ? value.end : undefined), end: value.start && value.end && value.end !== "present" ? value.end : undefined }
}

/* ------------------------------------------------------------------ language level */

/**
 * The level and test of a language, from the wording the CV uses. The
 * model's own level is accepted only for a wording this module can't read;
 * with no wording at all there is no level.
 */
export function groundLevel(model: { level?: unknown; test?: unknown }, written: string, source: string, language = ""): { level?: string; test?: string } {
  // No wording copied: look at what the CV says right after the language's name.
  if (!written.trim() && language.trim()) {
    const at = fold(source).indexOf(fold(language.trim()))
    const tail = at < 0 ? "" : source.slice(at + language.trim().length, at + language.trim().length + 60).split(/\r?\n/)[0].split(/[,;\u060c\u00b7|](?![^()]*\))/)[0]
    if (/^\s*(?:[:(\u2013\u2014-]|\s{2,})/.test(tail)) written = tail.replace(/^[\s:(\u2013\u2014-]+/, "")
  }
  const read = readLanguageLevel(written)
  const allowed = ["native", "C2", "C1", "B2", "B1", "A2", "A1"]
  const level = read.level ?? (written.trim() && !read.test && allowed.includes(String(model.level)) ? String(model.level) : undefined)
  const modelTest = typeof model.test === "string" && model.test.trim() && fold(source).includes(fold(model.test.trim())) ? model.test.trim() : undefined
  const test = modelTest ?? read.test
  return { ...(level ? { level } : {}), ...(test ? { test: test.slice(0, 80) } : {}) }
}

/* ------------------------------------------------------------------ what was not read */

export type ReadEntry = { text: Record<string, string>; fields: Record<string, unknown>; facts: string[]; skills: string[]; bullets: { text: string }[] }

/**
 * Lines of the CV that ended up nowhere in the result: not in an entry, not
 * in the identity. Titles, contact lines and very short lines don't count.
 * Shown to the person so a missed job or diploma is visible, not silent.
 */
export function unreadLines(text: string, identity: Identity, entries: ReadEntry[], consumed: string[] = []): string[] {
  const seen = new Set<string>()
  const take = (value: unknown) => {
    if (typeof value === "string") for (const word of words(value)) seen.add(word)
    else if (value && typeof value === "object") for (const item of Object.values(value)) take(item)
  }
  take(identity)
  // Dates and levels are stored as values, not as the CV's words: the wording they came from counts as read.
  take(consumed)
  for (const entry of entries) take([entry.text, entry.fields, entry.facts, entry.skills, entry.bullets.map((bullet) => bullet.text)])
  const out: string[] = []
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/^[\s•*\-–]+/, "").trim()
    const list = words(line).filter((word) => word.length >= 3 && !/^\d+$/.test(word))
    if (list.length < 3 || isTitleLine(line)) continue
    if (list.length <= 6 && parseDateRange(line)?.start) continue
    if (EMAIL_ONE.test(line) || phonesIn(line).length) continue
    const known = list.filter((word) => seen.has(word)).length / list.length
    if (known < 0.5 && !out.includes(line)) out.push(line.slice(0, 240))
  }
  return out.slice(0, 40)
}

/** Words a CV uses for each contract type and work mode (text folded: no accents, lower case). */
const CHOICE_WORDS: Record<string, RegExp> = {
  full_time: /full[- ]?time|temps plein|temps complet|\bcdi\b|permanent|vollzeit|unbefristet|festanstellung|tiempo completo|jornada completa|indefinido|tempo pieno|indeterminato|tempo integral|voltijd|دوام كامل/,
  part_time: /part[- ]?time|temps partiel|teilzeit|tiempo parcial|media jornada|tempo parziale|meio periodo|deeltijd|دوام جزئي/,
  fixed_term: /\bcdd\b|fixed[- ]term|\bcontract(?:or)?\b|temporary|befristet|contrato temporal|determinato|duree determinee|عقد محدد/,
  internship: /\bintern(?:ship)?\b|\bstage\b|stagiaire|\bpfe\b|praktik|practicas|becari|tirocinio|estagi|تدريب|متدرب/,
  apprenticeship: /alternan|apprenti|ausbildung|werkstudent|duales studium|aprendiz|تمهين|تدرج/,
  freelance: /freelance|independant|self[- ]employed|freiberuf|selbststandig|autonomo|libero professionista|عمل حر|مستقل/,
  volunteer: /volunt|benevol|ehrenamt|تطوع/,
  remote: /\bremote\b|teletravail|a distance|home ?office|\bremoto\b|teletrabajo|thuiswerk|عن بعد/,
  hybrid: /hybrid|hibrid|ibrido|هجين/,
  onsite: /on[- ]?site|sur site|presentiel|vor ort|presencial|in sede|حضوري/,
}

/**
 * A contract type or work mode is kept only when the CV has a word for it:
 * a job with no such word is not "full-time", it is unstated.
 */
export function groundChoice(value: unknown, source: string): string | undefined {
  if (typeof value !== "string" || !value) return undefined
  const words = CHOICE_WORDS[value]
  return !words || words.test(fold(source)) ? value : undefined
}
