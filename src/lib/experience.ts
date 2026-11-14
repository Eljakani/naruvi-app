/**
 * How much working experience a profile shows, and how that compares with the
 * level a job asks for. Pure. A fit score only compares skills; a senior role
 * can match every skill of someone two years in, and they deserve to know.
 */

type Range = { start?: string; end?: string }

/** "2023" → Jan 2023, "2023-06" → Jun 2023, as a month count. */
function monthIndex(value: string | undefined, today: Date): number | null {
  if (!value) return null
  if (value === "present") return today.getFullYear() * 12 + today.getMonth()
  const match = value.match(/^(\d{4})(?:-(\d{1,2}))?/)
  if (!match) return null
  return Number(match[1]) * 12 + (match[2] ? Math.min(Math.max(Number(match[2]), 1), 12) - 1 : 0)
}

/** Months covered by the ranges; overlapping jobs count once, and an open range runs to today. */
export function experienceMonths(ranges: Range[], today = new Date()): number {
  const now = today.getFullYear() * 12 + today.getMonth()
  const spans = ranges
    .map((range) => {
      const start = monthIndex(range.start, today)
      if (start === null) return null
      // A range ending in a bare year or month includes that month.
      const end = Math.min(monthIndex(range.end, today) ?? start, now)
      return end >= start ? ([start, end + 1] as [number, number]) : null
    })
    .filter((span): span is [number, number] => span !== null)
    .sort((a, b) => a[0] - b[0])
  let total = 0
  let reach = -Infinity
  for (const [start, end] of spans) {
    if (end <= reach) continue
    total += end - Math.max(start, reach)
    reach = end
  }
  return total
}

/** Years a level usually means when the posting gives no number. */
const TYPICAL: Record<string, number> = { mid: 2, senior: 5, lead: 7, manager: 5, executive: 10 }

export type LevelCheck = {
  /** ok: within reach · stretch: a little short · reach: well short of what the level usually means. */
  status: "ok" | "stretch" | "reach"
  seniority: string
  /** Years the posting states, or the usual minimum for its level. */
  yearsAsked: number
  /** True when the posting itself gave the number. */
  stated: boolean
  /** Years of experience the profile shows, to one decimal. */
  yearsShown: number
}

/** Null when the job gives no level signal (or is entry level): nothing to compare. */
export function levelCheck(job: { seniority?: string | null; yearsRequired?: number | null }, months: number): LevelCheck | null {
  const seniority = job.seniority ?? "unspecified"
  if (seniority === "intern" || seniority === "junior") return null
  const stated = typeof job.yearsRequired === "number" && job.yearsRequired > 0
  const yearsAsked = stated ? job.yearsRequired! : TYPICAL[seniority]
  if (!yearsAsked) return null
  const yearsShown = Math.round((months / 12) * 10) / 10
  const status = yearsShown >= yearsAsked ? "ok" : yearsShown >= yearsAsked * 0.6 ? "stretch" : "reach"
  return { status, seniority, yearsAsked, stated, yearsShown }
}
