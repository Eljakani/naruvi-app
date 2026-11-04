/**
 * Parse free-text date ranges from CV entries ("Feb. 2025 - Aug. 2025",
 * "Mars 2026 – aujourd'hui", "2019 - 2025", "Since 2022") into sortable
 * yyyymm numbers. Pure; unknown formats return nulls (callers keep their
 * original order for those).
 */
const MONTHS: Record<string, number> = {}
const add = (names: string, month: number) => names.split(" ").forEach((name) => (MONTHS[name] = month))
add("jan january janv janvier ene enero januar", 1)
add("feb february fév fev févr fevr février fevrier febrero februar", 2)
add("mar march mars marzo märz maerz", 3)
add("apr april avr avril abr abril", 4)
add("may mai mayo", 5)
add("jun june juin junio juni", 6)
add("jul july juil juillet julio juli", 7)
add("aug august août aout ago agosto", 8)
add("sep sept september septembre septiembre", 9)
add("oct october octobre octubre oktober okt", 10)
add("nov november novembre noviembre", 11)
add("dec december déc dec décembre decembre dic diciembre dezember dez", 12)
add("spring printemps", 4)
add("summer été ete", 7)
add("fall autumn automne", 10)
add("winter hiver", 1)

const PRESENT = /pr[ée]sent|current|now|today|ongoing|aujourd|actuel|en cours|presente|actualidad|heute|jetzt/i

export type DateRange = { start: number | null; end: number | null; current: boolean }

function point(text: string, fallbackMonth: number): number | null {
  const year = text.match(/(19|20)\d{2}/)?.[0]
  if (!year) return null
  const word = text
    .toLowerCase()
    .normalize("NFC")
    .match(/[a-zà-ÿ]+/g)
    ?.find((token) => MONTHS[token] || MONTHS[token.replace(/\.$/, "")])
  const numeric = text.match(/\b(0?[1-9]|1[0-2])[/.-](?:19|20)\d{2}\b/)?.[1]
  const month = word ? MONTHS[word] : numeric ? Number(numeric) : fallbackMonth
  return Number(year) * 100 + month
}

export function parseDateRange(raw: string | undefined | null): DateRange {
  const text = String(raw ?? "").trim()
  if (!text) return { start: null, end: null, current: false }
  const parts = text.split(/\s+(?:-|–|—|to|à|au|bis|a|hasta)\s+|\s*[–—]\s*|(?<=\d)\s*-\s*/i)
  const current = PRESENT.test(text)
  const start = point(parts[0] ?? "", 1)
  let end = parts.length > 1 ? point(parts[parts.length - 1], 12) : null
  if (current) end = 999999
  else if (end === null && start !== null && parts.length === 1) end = /since|depuis|desde|seit/i.test(text) ? 999999 : point(parts[0], 12)
  return { start, end, current: current || end === 999999 }
}

/** Newest first: ongoing, then latest end, then latest start; unknowns last. */
export function compareRangesDesc(a: DateRange, b: DateRange) {
  const key = (r: DateRange) => [r.end ?? -1, r.start ?? -1]
  const [ae, as] = key(a)
  const [be, bs] = key(b)
  return be - ae || bs - as
}
