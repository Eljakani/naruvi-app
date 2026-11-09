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

const strip = (value: string) => value.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase()

// Prefixes that identify a month in English or French (accents stripped).
const MONTH_PREFIXES: [string, number][] = [
  ["janv", 0], ["jan", 0], ["fev", 1], ["feb", 1], ["mars", 2], ["mar", 2], ["avr", 3], ["apr", 3], ["mai", 4], ["may", 4],
  ["juin", 5], ["june", 5], ["jun", 5], ["juil", 6], ["july", 6], ["jul", 6], ["aout", 7], ["aug", 7], ["sept", 8], ["sep", 8],
  ["oct", 9], ["nov", 10], ["dec", 11],
]
const PRESENT_WORDS = /\b(present|now|current|currently|today|ongoing|aujourd|ce jour|en cours|actuel|actuellement|maintenant)/

function monthOf(word: string): number | null {
  const clean = strip(word).replace(/[^a-z]/g, "")
  if (clean.length < 3) return null
  for (const [prefix, month] of MONTH_PREFIXES) if (clean.startsWith(prefix)) return month
  return null
}

function readPoint(text: string): MonthYear | null {
  const year = text.match(/\b(19|20)\d{2}\b/)
  if (!year) {
    // "03/2023" handled below; otherwise nothing usable.
    return null
  }
  const numeric = text.match(/\b(0?[1-9]|1[0-2])\s*[/.-]\s*((?:19|20)\d{2})\b/)
  if (numeric) return { year: Number(numeric[2]), month: Number(numeric[1]) - 1 }
  const words = text.replace(year[0], " ").split(/[\s,]+/).filter(Boolean)
  const month = words.map(monthOf).find((value) => value !== null) ?? null
  return { year: Number(year[0]), month }
}

/** Read "Mar. 2023 - Jan. 2025", "Février 2024 – aujourd’hui", "2019 – 2021", "03/2023 - present". Null when it can't. */
export function parseDateRange(text: string): DateRange | null {
  const value = text.trim()
  if (!value) return { start: null, end: null }
  const parts = value.split(/\s+[-–—]\s+|\s*[–—]\s*|\s+(?:to|à|au|until|jusqu’à|jusqu'à)\s+|(?<=\d{4})\s*-\s*(?=\D|\d{4})/i)
  if (parts.length > 2) return null
  const start = readPoint(parts[0])
  if (!start) return null
  if (parts.length === 1) return PRESENT_WORDS.test(strip(value)) ? { start, end: "present" } : { start, end: null }
  const endText = parts[1]
  if (PRESENT_WORDS.test(strip(endText))) return { start, end: "present" }
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
