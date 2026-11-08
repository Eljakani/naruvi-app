/**
 * Search goals: what the person is looking for (contract, places, work mode,
 * where they may legally work, duration) and a pure check of a job against them.
 * The skills fit says "can you do it"; this says "is it what you want, and can you take it".
 */
import { z } from "zod"
import { CONTRACT_TYPES, type ContractType, type Programme } from "@/lib/job-program"
import { COUNTRIES, countryIn, within } from "@/lib/geo"

export const WORK_MODES = { onsite: "On site", hybrid: "Hybrid", remote: "Remote" } as const
export type WorkMode = keyof typeof WORK_MODES
const CONTRACT_KEYS = Object.keys(CONTRACT_TYPES).filter((key) => key !== "unspecified") as [Exclude<ContractType, "unspecified">]

export const searchGoal = z.object({
  id: z.string().min(1).max(40),
  name: z.string().trim().min(1, "Name the goal").max(60),
  active: z.boolean().default(true),
  contracts: z.array(z.enum(CONTRACT_KEYS)).max(9).default([]),
  places: z.array(z.string().trim().min(1).max(80)).max(12).default([]),
  workModes: z.array(z.enum(["onsite", "hybrid", "remote"])).max(3).default([]),
  /** ISO codes of countries where the person can work without sponsorship. Empty: not set. */
  authorizedIn: z.array(z.string().regex(/^[a-z]{2}$/)).max(30).default([]),
  /** For internships, alternance and other time-bound contracts. */
  minMonths: z.number().int().min(1).max(60).nullable().default(null),
  maxMonths: z.number().int().min(1).max(60).nullable().default(null),
})
export type SearchGoal = z.infer<typeof searchGoal>
export const searchGoals = z.array(searchGoal).max(8)

export type GoalJob = {
  location: string
  remote: string
  insights?: { contract?: string; workMode?: string; programme?: Programme; visaSponsorship?: boolean | null } | null
}

export type CheckStatus = "ok" | "check" | "blocked"
export type GoalCheck = { kind: "contract" | "place" | "work_mode" | "authorization" | "duration"; status: CheckStatus; text: string }
export type GoalFit = { verdict: CheckStatus; goal: Pick<SearchGoal, "id" | "name">; implicit: boolean; checks: GoalCheck[] }

const CONTRACT_NAME: Record<string, string> = { permanent: "a CDI / permanent job", fixed_term: "a CDD", freelance: "freelance", internship: "an internship", apprenticeship: "an alternance", student_job: "a student job", volunteer: "a volunteer programme (VIE…)", temporary: "temp work", seasonal: "seasonal work" }
const country = (code: string) => COUNTRIES[code]?.name ?? code.toUpperCase()
const list = (items: string[]) => (items.length < 2 ? items.join("") : `${items.slice(0, -1).join(", ")} or ${items.at(-1)}`)

/** "4 à 6 mois" → [4, 6]; "6 months" → [6, 6]; "2 ans" → [24, 24]; null if unreadable. */
export function monthsOf(duration: string): [number, number] | null {
  const match = duration.match(/(\d{1,2})\s*(?:(?:à|-|–|to|bis|a)\s*(\d{1,2}))?\s*(mois|months?|monate?|meses|semaines|weeks?|wochen|ans?|years?|jahre)/i)
  if (!match) return null
  const unit = match[3].toLowerCase()
  const scale = /^(an|ans|year|years|jahre)$/.test(unit) ? 12 : /^(semaines|week|weeks|wochen)$/.test(unit) ? 0.25 : 1
  const low = Math.round(Number(match[1]) * scale)
  return [low, Math.round(Number(match[2] ?? match[1]) * scale)]
}

function workModeOf(job: GoalJob): WorkMode | null {
  const mode = job.insights?.workMode
  if (mode === "onsite" || mode === "hybrid" || mode === "remote") return mode
  const text = job.remote.toLowerCase()
  return /hybrid|hybride/.test(text) ? "hybrid" : /remote|télétravail|distance/.test(text) ? "remote" : /site|présentiel/.test(text) ? "onsite" : null
}

export function checkGoal(goal: SearchGoal, job: GoalJob): GoalCheck[] {
  const checks: GoalCheck[] = []
  const contract = job.insights?.contract && job.insights.contract !== "unspecified" ? job.insights.contract : null
  if (goal.contracts.length) {
    const wanted = list(goal.contracts.map((key) => CONTRACT_NAME[key] ?? key))
    if (!contract) checks.push({ kind: "contract", status: "check", text: `The posting doesn't say the contract type; you want ${wanted}.` })
    else if (goal.contracts.includes(contract as SearchGoal["contracts"][number])) checks.push({ kind: "contract", status: "ok", text: `It's ${CONTRACT_NAME[contract] ?? contract}.` })
    else checks.push({ kind: "contract", status: "blocked", text: `It's ${CONTRACT_NAME[contract] ?? contract}; you want ${wanted}.` })
  }

  const mode = workModeOf(job)
  if (goal.workModes.length && mode) {
    if (goal.workModes.includes(mode)) checks.push({ kind: "work_mode", status: "ok", text: `${WORK_MODES[mode]}, which works for you.` })
    else checks.push({ kind: "work_mode", status: "blocked", text: `It's ${WORK_MODES[mode].toLowerCase()}; you want ${list(goal.workModes.map((item) => WORK_MODES[item].toLowerCase()))}.` })
  }

  const jobCountry = countryIn(job.location)
  const remoteOk = mode === "remote" && (!goal.workModes.length || goal.workModes.includes("remote"))
  if (goal.places.length) {
    const results = goal.places.map((place) => within(job.location, place))
    const where = job.location || "no location"
    if (!job.location.trim()) checks.push({ kind: "place", status: remoteOk ? "ok" : "check", text: remoteOk ? "Remote, no location stated." : `The posting gives no location; you're looking in ${list(goal.places)}.` })
    else if (results.includes(true)) checks.push({ kind: "place", status: "ok", text: `${where} is in your search area.` })
    else if (remoteOk) checks.push({ kind: "place", status: "check", text: `Remote, but the job is based in ${where}. Check they hire from where you live${jobCountry ? ` and how a contract from ${country(jobCountry)} works for you` : ""}.` })
    else if (results.every((result) => result === false)) checks.push({ kind: "place", status: "blocked", text: `It's in ${where}; you're looking in ${list(goal.places)}.` })
    else checks.push({ kind: "place", status: "check", text: `Couldn't tell if ${where} is in ${list(goal.places)}.` })
  }

  if (goal.authorizedIn.length && jobCountry && !goal.authorizedIn.includes(jobCountry)) {
    const sponsor = job.insights?.visaSponsorship
    checks.push(sponsor === true
      ? { kind: "authorization", status: "ok", text: `You'd need a permit for ${country(jobCountry)}; the posting offers sponsorship.` }
      : sponsor === false
        ? { kind: "authorization", status: "blocked", text: `You'd need a permit for ${country(jobCountry)}, and they say they don't sponsor.` }
        : { kind: "authorization", status: "check", text: `You'd need the right to work in ${country(jobCountry)}; the posting doesn't mention sponsorship.` })
  }

  const range = job.insights?.programme?.duration ? monthsOf(job.insights.programme.duration) : null
  if (range && (goal.minMonths || goal.maxMonths)) {
    const [low, high] = range
    const min = goal.minMonths ?? 0, max = goal.maxMonths ?? 99
    const label = job.insights!.programme!.duration
    checks.push(high < min || low > max
      ? { kind: "duration", status: "blocked", text: `Lasts ${label}; you want ${goal.minMonths ?? "any"}–${goal.maxMonths ?? "any"} months.` }
      : { kind: "duration", status: "ok", text: `Lasts ${label}, within what you want.` })
  }
  return checks
}

const RANK: Record<CheckStatus, number> = { ok: 0, check: 1, blocked: 2 }
const verdictOf = (checks: GoalCheck[]): CheckStatus => checks.reduce<CheckStatus>((worst, item) => (RANK[item.status] > RANK[worst] ? item.status : worst), "ok")

/**
 * The job against the best-matching active goal. Without goals, the profile
 * location stands in as an implicit place goal. Null when there's nothing to check.
 */
export function goalFit(goals: SearchGoal[], job: GoalJob, profileLocation = ""): GoalFit | null {
  const active = goals.filter((goal) => goal.active)
  const implicit = !active.length
  const candidates = implicit
    ? profileLocation.trim() && job.location.trim() ? [searchGoal.parse({ id: "profile", name: "Your profile location", places: [profileLocation.trim()] })] : []
    : active
  const results = candidates.map((goal) => {
    // The profile location is where they live, not a stated goal: flag a mismatch, don't rule the job out.
    const checks = checkGoal(goal, job).map((item) => (implicit && item.status === "blocked" ? { ...item, status: "check" as const } : item))
    return { fit: { verdict: verdictOf(checks), goal: { id: goal.id, name: goal.name }, implicit, checks }, score: checks.reduce((sum, item) => sum + RANK[item.status] * 10, 0) - checks.filter((item) => item.status === "ok").length }
  }).filter((result) => result.fit.checks.length)
  return results.sort((a, b) => a.score - b.score)[0]?.fit ?? null
}
