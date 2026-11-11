import "server-only"
import { and, eq, isNotNull, isNull, lt, or } from "drizzle-orm"
import { boardApi, boardOf, postingsFrom, BOARD_PROVIDERS, type CareersBoard } from "@/lib/careers-boards"
import { canonicalJobUrl } from "@/lib/job-alerts"
import { contractOf } from "@/lib/job-program"
import { goalFit } from "@/lib/search-goals"
import { safeFetchText } from "@/server/assets/safe-fetch"
import { db } from "@/server/db/client"
import { companies, jobs } from "@/server/db/schema"
import { getProfile } from "@/server/profile/repository"
import { addLeads } from "./leads"
import { goalRoles, titleFits } from "@/lib/discover"

const EVERY_MS = 6 * 60 * 60_000
const MAX_NEW = 25

async function fetchPostings(board: CareersBoard) {
  const response = await safeFetchText(boardApi(board), 5 * 1024 * 1024)
  if (response.status === 404) throw new Error(`No public ${BOARD_PROVIDERS[board.provider]} board named “${board.slug}”.`)
  if (response.status >= 400) throw new Error(`${BOARD_PROVIDERS[board.provider]} answered ${response.status}. Try again later.`)
  return postingsFrom(board, JSON.parse(response.text))
}

/** The board this company's saved postings came from, to offer watching it. */
export async function detectBoard(companyId: string): Promise<CareersBoard | null> {
  const rows = await db.select({ url: jobs.sourceUrl, canonical: jobs.canonicalUrl }).from(jobs).where(eq(jobs.companyId, companyId))
  for (const row of rows) for (const url of [row.canonical, row.url]) {
    const board = url ? boardOf(url) : null
    if (board) return board
  }
  return null
}

/** Start watching: the URL can be the careers page or any posting on it. Checks it right away. */
export async function watchCareers(companyId: string, url: string) {
  const board = boardOf(url)
  if (!board) throw new Error(`Paste a careers page on ${Object.values(BOARD_PROVIDERS).join(", ")}.`)
  await fetchPostings(board)
  await db.update(companies).set({ careers: board, careersCheckedAt: null }).where(eq(companies.id, companyId))
  return checkCareers(companyId)
}

export async function unwatchCareers(companyId: string) {
  await db.update(companies).set({ careers: null, careersCheckedAt: null }).where(eq(companies.id, companyId))
}

/**
 * New postings on the company's board become job leads. Postings that clearly
 * miss an active search goal (not one of its roles, wrong contract or place)
 * are left out.
 */
export async function checkCareers(companyId: string) {
  const [company] = await db.select().from(companies).where(eq(companies.id, companyId))
  if (!company?.careers) return 0
  const board = company.careers as CareersBoard
  const [postings, profile] = await Promise.all([fetchPostings(board), getProfile()])
  const goals = profile?.goals ?? []
  // A careers page lists every opening (accountants, sales…): keep the ones about a role your goals name.
  const roles = goalRoles(goals)
  const wanted = postings.filter((posting) => {
    if (roles.length && !titleFits(posting.title, roles)) return false
    // Only stated goals filter here: a location alone shouldn't hide postings you never saw.
    if (!goals.some((goal) => goal.active)) return true
    const fit = goalFit(goals, { location: posting.location, remote: posting.remote, insights: { contract: contractOf(`${posting.title} ${posting.contract}`) } })
    return fit?.verdict !== "blocked"
  })
  const leads = wanted.slice(0, MAX_NEW).map((posting) => {
    const canonical = canonicalJobUrl(posting.url)
    // The board (Greenhouse, Lever…) only hosts the posting: the employer is the watched company.
    return { url: canonical?.url ?? posting.url, board: canonical?.board ?? board.provider, title: posting.title.slice(0, 160), company: company.name, location: posting.location.slice(0, 160), logoPath: company.logoPath }
  })
  const added = await addLeads(leads, `New on ${company.name}’s careers page`, new Date())
  await db.update(companies).set({ careersCheckedAt: new Date() }).where(eq(companies.id, companyId))
  return added
}

/** Background: watched boards not checked in the last few hours, a few at a time. */
export async function checkDueCareers() {
  const due = await db.select({ id: companies.id, name: companies.name }).from(companies)
    .where(and(isNotNull(companies.careers), or(isNull(companies.careersCheckedAt), lt(companies.careersCheckedAt, new Date(Date.now() - EVERY_MS)))))
    .limit(10)
  for (const company of due) await checkCareers(company.id).catch((error) => console.error(`[naruvi] careers ${company.name}:`, error instanceof Error ? error.message : error))
}
