/**
 * Entry dates are stored as display text per language ("Mar. 2023 – Jan. 2025",
 * "mars 2023 – janv. 2025"). These helpers read that text into a structured
 * range, so it can be edited with pickers, and write it back for each language
 * in one consistent CV style.
 */

export type MonthYear = { year: number; month: number | null }
export type DateRange = { start: MonthYear | null; end: MonthYear | "present" | null }

const EN_SHORT = ["Jan.", "Feb.", "Mar.", "Apr.", "May", "June", "July", "Aug.", "Sept.", "Oct.", "Nov.", "Dec."]
const FR_SHORT = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."]
export const MONTH_NAMES: Record<"en" | "fr", string[]> = {
  en: ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"],
  fr: ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"],
}
const PRESENT: Record<"en" | "fr", string> = { en: "Present", fr: "aujourd’hui" }

const ARABIC_DIGITS = /[٠-٩۰-۹]/g
const strip = (value: string) => value.normalize("NFKD").replace(/[\u0300-\u036f\u0653-\u0655]/g, "").toLowerCase()
/** Arabic-Indic digits as ASCII, direction marks removed. */
const plainDigits = (value: string) => value.replace(ARABIC_DIGITS, (digit) => String(digit.charCodeAt(0) & 0xf)).replace(/[‎‏‪-‮⁦-⁩]/g, "")

// Prefixes that identify a month in English or French (accents stripped).
const MONTH_PREFIXES: [string, number][] = [
  ["janv", 0], ["jan", 0], ["fev", 1], ["feb", 1], ["mars", 2], ["mar", 2], ["avr", 3], ["apr", 3], ["mai", 4], ["may", 4],
  ["juin", 5], ["june", 5], ["jun", 5], ["juil", 6], ["july", 6], ["jul", 6], ["aout", 7], ["aug", 7], ["sept", 8], ["sep", 8],
  ["oct", 9], ["nov", 10], ["dec", 11],
]
/**
 * Months in Spanish, German, Italian, Portuguese and Dutch that the prefixes
 * above miss. Short forms must match the whole word ("set", "out" and "ago"
 * are also ordinary words); longer stems match as a prefix.
 */
const MONTH_WORDS: [string[], string[], number][] = [
  [["ene", "gen"], ["enero", "genn", "janei"], 0],
  [[], ["fevr", "febb"], 1],
  [["mrt"], ["maart"], 2],
  [["abr"], ["abri"], 3],
  [["mag", "mei"], ["magg", "mayo", "maio"], 4],
  [["giu"], ["giug"], 5],
  [["lug"], ["lugl"], 6],
  [["ago"], ["agos"], 7],
  [["set"], ["sett", "sete"], 8],
  [["okt", "ott", "out"], ["okto", "otto", "outu"], 9],
  [["dic", "dez"], ["dici", "dice", "deze"], 11],
]
const ARABIC_MONTHS: [RegExp, number][] = [
  [/^(?:يناير|جانفي|كانون الثاني)/, 0],
  [/^(?:فبراير|فيفري|شباط)/, 1],
  [/^(?:مارس|آذار)/, 2],
  [/^(?:أبريل|ابريل|أفريل|نيسان)/, 3],
  [/^(?:مايو|ماي|أيار)/, 4],
  [/^(?:يونيو|يونيه|جوان|حزيران)/, 5],
  [/^(?:يوليوز|يوليو|يوليه|جويلية|تموز)/, 6],
  [/^(?:أغسطس|اغسطس|غشت|أوت|آب)/, 7],
  [/^(?:سبتمبر|شتنبر|أيلول)/, 8],
  [/^(?:أكتوبر|اكتوبر|تشرين الأول)/, 9],
  [/^(?:نوفمبر|نونبر|تشرين الثاني)/, 10],
  [/^(?:ديسمبر|دجنبر|كانون الأول)/, 11],
]
const PRESENT_WORDS = /(?:\b(?:present|now|current|currently|today|ongoing|to date|aujourd|ce jour|en cours|actuel|actuellement|maintenant|actualidad|actualmente|presente|hoy|heute|jetzt|aktuell|laufend|oggi|attuale|attualmente|atual|atualmente|heden)\b|الآن|الان|حاليا|الحاضر|اليوم)/
// "aujourd'hui" and "actuelle" continue past the stem, so the stems above end on a word boundary only where they are whole words.
const PRESENT_STEMS = /\b(?:aujourd|actuel|present)/
/** "since 2021", "depuis mars 2022", "seit 04/2021": a start with no end, still going on. */
const SINCE = /^(?:since|from|depuis|des|seit|ab|desde|dal|da|sinds|vanaf|منذ)\s+/
const isPresent = (text: string) => PRESENT_WORDS.test(text) || PRESENT_STEMS.test(text)

function monthOf(word: string): number | null {
  for (const [pattern, month] of ARABIC_MONTHS) if (pattern.test(word)) return month
  const clean = strip(word).replace(/[^a-z]/g, "")
  if (clean.length < 3) return null
  for (const [short, stems, month] of MONTH_WORDS) if (short.includes(clean) || stems.some((stem) => clean.startsWith(stem))) return month
  for (const [prefix, month] of MONTH_PREFIXES) if (clean.startsWith(prefix)) return month
  return null
}

function readPoint(text: string): MonthYear | null {
  const year = text.match(/(?<!\d)(19|20)\d{2}(?!\d)/)
  if (!year) return null
  // "03/2023", "15.03.2023", then ISO "2023-03" and "2023-03-15".
  const numeric = text.match(/(?<!\d)(0?[1-9]|1[0-2])\s*[/.-]\s*((?:19|20)\d{2})(?!\d)/)
  if (numeric) return { year: Number(numeric[2]), month: Number(numeric[1]) - 1 }
  const iso = text.match(/(?<!\d)((?:19|20)\d{2})[-/.](0[1-9]|1[0-2])(?!\d)/)
  if (iso) return { year: Number(iso[1]), month: Number(iso[2]) - 1 }
  const words = text.replace(year[0], " ").split(/[\s,.]+/).filter(Boolean)
  // Arabic month names can be two words ("كانون الثاني").
  const month = words.map((word, index) => monthOf(`${word} ${words[index + 1] ?? ""}`.trim()) ?? monthOf(word)).find((value) => value !== null) ?? null
  return { year: Number(year[0]), month }
}

const RANGE_SPLIT = /\s+[-–—→>]+\s+|\s*[–—→]\s*|\s*->\s*|\s+(?:to|à|au|until|till|jusqu’à|jusqu'à|bis|hasta|al?|até|tot|إلى|حتى)\s+|(?<=\d{4})\s*-\s*(?=\D|\d{4})/i

/**
 * Read "Mar. 2023 - Jan. 2025", "Février 2024 – aujourd’hui", "2019 – 2021",
 * "03/2023 - present", "seit 04/2021", "enero de 2020 – actualidad",
 * "2017-10 → 2019-09", "يناير 2021 – حتى الآن". Null when it can't.
 */
export function parseDateRange(text: string): DateRange | null {
  const value = plainDigits(text).trim()
  if (!value) return { start: null, end: null }
  // "2019-20" and "2019/20": a school year, not a month.
  const schoolYear = value.match(/^((?:19|20)\d{2})\s*[-/–]\s*(\d{2})$/)
  if (schoolYear && Number(schoolYear[2]) === (Number(schoolYear[1]) + 1) % 100) return { start: { year: Number(schoolYear[1]), month: null }, end: { year: Number(schoolYear[1]) + 1, month: null } }
  const lower = strip(value)
  const since = lower.match(SINCE)
  // An ISO month ("2017-10") must not be cut at its own hyphen.
  // "– حتى الآن", "- until now", "– bis heute": the word after the dash is part of the end, not a second separator.
  // A separator that lost its glyph ("2017-10 ’ 2019-09", "2014 • 2017"): any lone symbol between two dates.
  const repaired = value.replace(/(\d)\s+[^\p{L}\p{N}\s]{1,2}\s+(?=(?:\p{L}{3,12}\.?\s+)?(?:19|20)\d{2}(?!\d)|(?:0?[1-9]|1[0-2])[/.](?:19|20)\d{2}|(?:now|present|today)\b)/giu, "$1 \u2013 ")
  const guarded = repaired.replace(/([-\u2013\u2014]\s*)(?:\u062d\u062a\u0649|until|till|bis|hasta|jusqu['\u2019]\u00e0)\s+/gi, "$1").replace(/((?:19|20)\d{2})-(0[1-9]|1[0-2])(?!\d)/g, "$1⁠$2")
  const parts = guarded.split(RANGE_SPLIT).map((part) => part.replace(/⁠/g, "-")).filter((part) => part.trim())
  if (!parts.length || parts.length > 2) return null
  // "حتى الآن" is the end, not a separator followed by nothing.
  const start = readPoint(parts[0])
  if (!start) return null
  if (parts.length === 1) return isPresent(lower) || since ? { start, end: "present" } : { start, end: null }
  const endText = parts[1]
  if (isPresent(strip(endText))) return { start, end: "present" }
  const end = readPoint(endText)
  if (!end) return null
  return { start, end }
}

function writePoint(point: MonthYear, language: "en" | "fr") {
  if (point.month === null) return String(point.year)
  return `${(language === "fr" ? FR_SHORT : EN_SHORT)[point.month]} ${point.year}`
}

/** "Mar. 2023 – Jan. 2025" / "mars 2023 – janv. 2025" / "2019 – Present". */
export function formatDateRange(range: DateRange, language: "en" | "fr"): string {
  if (!range.start) return ""
  const start = writePoint(range.start, language)
  if (!range.end) return start
  const end = range.end === "present" ? PRESENT[language] : writePoint(range.end, language)
  return start === end ? start : `${start} – ${end}`
}

/** Whole months between start and end (or today), for "2 yrs 3 mos". Null without months on both sides. */
export function durationMonths(range: DateRange, today?: Date): number | null {
  if (!range.start || range.start.month === null || !range.end) return null
  // Read the clock only for "present": prerendering an empty range must not touch the current time.
  const now = range.end === "present" ? (today ?? new Date()) : null
  const end = now ? { year: now.getFullYear(), month: now.getMonth() } : (range.end as MonthYear)
  if (end.month === null) return null
  const months = (end.year - range.start.year) * 12 + (end.month - range.start.month) + 1
  return months > 0 ? months : null
}

export function formatDuration(months: number, language: "en" | "fr"): string {
  const years = Math.floor(months / 12)
  const rest = months % 12
  const parts = language === "fr"
    ? [years ? `${years} an${years > 1 ? "s" : ""}` : "", rest ? `${rest} mois` : ""]
    : [years ? `${years} yr${years > 1 ? "s" : ""}` : "", rest ? `${rest} mo${rest > 1 ? "s" : ""}` : ""]
  return parts.filter(Boolean).join(" ")
}

/** End must not come before start. */
export function rangeError(range: DateRange): string | null {
  if (!range.start || !range.end || range.end === "present") return null
  const start = range.start.year * 12 + (range.start.month ?? 0)
  const end = range.end.year * 12 + (range.end.month ?? 11)
  return end < start ? "The end is before the start." : null
}
