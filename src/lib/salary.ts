/**
 * Read a salary written in a job posting ("45–55 k€ brut/an", "$120K/yr",
 * "£30 an hour") into numbers, so postings can be compared with each other
 * and with market data. Everything is turned into a yearly amount.
 */

export type Period = "year" | "month" | "day" | "hour"

export type SalaryRange = {
  min: number
  max: number
  currency: string | null
  /** How the posting wrote it, before turning it into a yearly amount. */
  period: Period
  /** Yearly amounts. */
  yearlyMin: number
  yearlyMax: number
}

const PER_YEAR: Record<Period, number> = { year: 1, month: 12, day: 218, hour: 1607 }

const CURRENCIES: [RegExp, string][] = [
  [/€|\beur(os?)?\b/i, "EUR"],
  [/£|\bgbp\b/i, "GBP"],
  [/\bchf\b/i, "CHF"],
  [/\bcad\b|c\$/i, "CAD"],
  [/\baud\b|a\$/i, "AUD"],
  [/\bmad\b|\bdh\b|dirhams?/i, "MAD"],
  [/\$|\busd\b/i, "USD"],
]

function periodOf(text: string, sample: number): Period {
  if (/\b(hour|hourly|hr|heure|horaire|stunde)\b|\/\s*h\b/i.test(text)) return "hour"
  if (/\b(day|daily|jour|tjm|journalier|tag)\b|\/\s*j\b/i.test(text)) return "day"
  if (/\b(month|monthly|mois|mensuel|monat)\b|\/\s*m\b/i.test(text)) return "month"
  if (/\b(year|yearly|annual|annum|an|annuel|jahr|p\.?a\.?)\b|\/\s*(yr|y)\b/i.test(text)) return "year"
  // No unit written: guess from the size of the number.
  if (sample < 200) return "hour"
  if (sample < 1500) return "day"
  if (sample < 15000) return "month"
  return "year"
}

/** "45 000", "45,000", "45.000", "45k", "45,5k", "1.2m" → number. */
function amount(raw: string, suffix: string): number {
  let text = raw.replace(/[\s  ']/g, "")
  // A separator followed by exactly three digits is a thousands separator.
  if (/^\d{1,3}([.,]\d{3})+$/.test(text)) text = text.replace(/[.,]/g, "")
  else text = text.replace(",", ".")
  const value = Number(text)
  const multiplier = /^k$/i.test(suffix) ? 1_000 : /^(m|mio)$/i.test(suffix) ? 1_000_000 : 1
  return value * multiplier
}

const NUMBER = /(\d{1,3}(?:[\s  .,']\d{3})+|\d+(?:[.,]\d+)?)\s*(k|m|mio)?(?![a-z])/gi

export function parseSalary(text: string): SalaryRange | null {
  if (!text || !/\d/.test(text)) return null
  const found = [...text.matchAll(NUMBER)].map((match) => ({ value: amount(match[1], match[2] ?? ""), suffix: match[2] ?? "" }))
  const values = found.filter((item) => item.value >= 5)
  if (!values.length) return null
  // "45-55k": the k on the second number applies to the first one too.
  if (values.length >= 2 && values[1].suffix && !values[0].suffix && values[0].value < 1000) {
    values[0] = { value: amount(String(values[0].value), values[1].suffix), suffix: values[1].suffix }
  }
  const [first, second] = values
  const min = Math.min(first.value, second?.value ?? first.value)
  const max = Math.max(first.value, second?.value ?? first.value)
  if (max > min * 4) return null
  const currency = CURRENCIES.find(([pattern]) => pattern.test(text))?.[1] ?? null
  const period = periodOf(text, max)
  const factor = PER_YEAR[period]
  const yearlyMin = Math.round(min * factor)
  const yearlyMax = Math.round(max * factor)
  if (yearlyMax < 3000 || yearlyMax > 5_000_000) return null
  return { min, max, currency, period, yearlyMin, yearlyMax }
}

/** "€45k" style, short enough for a chip or an axis label. */
export function formatAmount(value: number, currency: string | null, locale?: string): string {
  return new Intl.NumberFormat(locale, {
    style: currency ? "currency" : "decimal",
    currency: currency ?? undefined,
    notation: "compact",
    maximumFractionDigits: value >= 100_000 ? 0 : 1,
  }).format(value)
}

export function median(values: number[]): number | null {
  if (!values.length) return null
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[middle] : Math.round((sorted[middle - 1] + sorted[middle]) / 2)
}
