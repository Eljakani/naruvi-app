import "server-only"
import { inArray, isNull } from "drizzle-orm"
import { goalFit, type GoalJob } from "@/lib/search-goals"
import { db } from "@/server/db/client"
import { jobs } from "@/server/db/schema"
import { getProfile } from "@/server/profile/repository"

/** Store each job's goal verdict so the Jobs list can filter and sort on it. All jobs, or just `jobIds`. */
export async function refreshGoalVerdicts(jobIds?: string[]) {
  if (jobIds && !jobIds.length) return
  const profile = await getProfile()
  const rows = await db.select({ id: jobs.id, board: jobs.board, location: jobs.location, remote: jobs.remote, insights: jobs.insights }).from(jobs).where(jobIds ? inArray(jobs.id, jobIds) : undefined)
  const byVerdict = new Map<string, string[]>()
  for (const row of rows) {
    // A spontaneous application has no posting to check.
    const fit = profile && row.board !== "spontaneous" ? goalFit(profile.goals, { ...row, insights: row.insights as GoalJob["insights"] }, profile.location) : null
    const verdict = fit?.verdict ?? "none"
    byVerdict.set(verdict, [...(byVerdict.get(verdict) ?? []), row.id])
  }
  for (const [verdict, ids] of byVerdict) await db.update(jobs).set({ goalVerdict: verdict }).where(inArray(jobs.id, ids))
}

/** Jobs saved before goal verdicts existed, or whose refresh failed. */
export async function backfillGoalVerdicts() {
  const missing = await db.select({ id: jobs.id }).from(jobs).where(isNull(jobs.goalVerdict)).limit(500)
  await refreshGoalVerdicts(missing.map((row) => row.id))
}
