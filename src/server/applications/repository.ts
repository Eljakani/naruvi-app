import "server-only"
import { advanceAutomatically } from "@/server/tracking/service"
import { and, desc, eq, inArray } from "drizzle-orm"
import { db } from "@/server/db/client"
import { applications, entries, facts, jobs } from "@/server/db/schema"
import { indexFacts, matchRequirement, summarize, type Analysis, type ProfileFact } from "@/server/analysis/match"
import { REVIEW_PROMPT_VERSION, reviewAllMatches } from "@/server/analysis/refine"
import { getLlmOverview } from "@/server/settings/llm"
import { completionForRun } from "@/server/llm/client"
import { coverLetterDecision, extractRequirementCandidates } from "@/server/analysis/requirements"
import { FILTER_PROMPT_VERSION, filterRequirements, type RequirementFilterSummary } from "@/server/analysis/filter"
import { getProfile } from "@/server/profile/repository"
import { startRun } from "@/server/runs/tracer"

/** Only verified entries are evidence. Needs-review and archived never count. */
export async function loadProfileFacts(profileId: string): Promise<ProfileFact[]> {
  const verified = await db.select().from(entries).where(and(eq(entries.profileId, profileId), eq(entries.status, "verified")))
  if (!verified.length) return []
  const rows = await db.select().from(facts).where(inArray(facts.entryId, verified.map((entry) => entry.id)))
  return rows.map((fact) => {
    const entry = verified.find((item) => item.id === fact.entryId)!
    return {
      id: fact.id,
      statement: fact.statement,
      entryId: entry.id,
      entryTitle: entry.display.en?.organization || entry.title,
      entryKind: entry.kind,
      entryTags: entry.tags,
      entrySkills: entry.skills,
    }
  })
}

export type StoredAnalysis = Analysis & { coverLetter: { decision: string; evidence: string }; analyzedAt: string; factCount: number; runId: string; requirementFilter?: RequirementFilterSummary; modelReview: { reviewed: number; changed: number; model?: string } | null }

/** Create (or reuse) the application for a job and (re)run the analysis. */
export async function analyzeJob(jobId: string) {
  const profile = await getProfile()
  if (!profile) throw new Error("Create your profile first: analysis compares the job with your verified facts.")
  const job = await db.query.jobs.findFirst({ where: eq(jobs.id, jobId) })
  if (!job) throw new Error("Job not found.")
  const run = await startRun("application.analyze", { jobId })
  try {
    const extraction = await run.step("extract requirement candidates", async () => extractRequirementCandidates(job.rawText), (value) => `${value.candidates.length} posting items · ${value.requirements.length} rule-based requirements`)
    const modelConfiguration = await run.step("Check AI configuration", () => getLlmOverview(), (value) => value.configured ? `${value.model} configured` : "AI filtering unavailable; rule-based extraction will be used.").catch(() => null)
    const filtered = await run.step("filter posting details", () => filterRequirements(extraction, job.rawText, modelConfiguration?.configured ? completionForRun(run, "requirement filtering", FILTER_PROMPT_VERSION) : undefined), (value) => `${value.summary.reviewed} items reviewed · ${value.requirements.length} requirements kept · ${value.summary.excluded.length} posting details excluded · ${value.summary.status}`)
    const requirements = filtered.requirements
    const profileFacts = await run.step("load verified facts", () => loadProfileFacts(profile.id), (value) => `${value.length} facts`)
    if (!profileFacts.length) throw new Error("No verified facts yet. Verify at least a few profile entries first.")
    const indexed = indexFacts(profileFacts)
    let matches = await run.step("match evidence (rules)", async () => requirements.map((requirement) => matchRequirement(requirement, indexed)), (value) => `${value.filter((m) => m.status === "met").length} met · ${value.filter((m) => m.status === "partial").length} partial · ${value.filter((m) => m.status === "gap").length} gap`)
    let modelReview: { reviewed: number; changed: number; model?: string } | null = null
    if (modelConfiguration?.configured) {
      let model = ""
      const catalog = profileFacts.map((fact) => ({ id: fact.id, statement: fact.statement, entry: fact.entryTitle, kind: fact.entryKind }))
      const reviewed = await run
        .step(
          `AI fit review (${REVIEW_PROMPT_VERSION})`,
          () => reviewAllMatches(matches, catalog, async (input) => {
            const completion = await completionForRun(run, "fit review", REVIEW_PROMPT_VERSION)(input)
            model = completion.model
            return completion
          }),
          (value) => `reviewed ${value.reviewed}/${matches.length} · changed ${value.changed}${value.failedBatches ? ` · ${value.failedBatches} batch(es) kept rule result` : ""}`,
        )
        .catch(() => null) // the model is an optional improvement, never a blocker
      if (reviewed && reviewed.reviewed > 0) {
        matches = reviewed.matches
        modelReview = { reviewed: reviewed.reviewed, changed: reviewed.changed, model }
      }
    }
    // Excluded process/benefit text must not reappear as missing skills in keyword coverage.
    const result = summarize(matches, profileFacts, requirements.map((requirement) => requirement.text).join("\n"))
    const coverLetter = coverLetterDecision(job.rawText)
    const stored: StoredAnalysis = { ...result, coverLetter, analyzedAt: new Date().toISOString(), factCount: profileFacts.length, runId: run.id, requirementFilter: filtered.summary, modelReview }
    const selected = [...new Set(result.requirements.filter((item) => item.status === "met" || item.status === "partial").flatMap((item) => item.factIds))]
    const values = {
      analysis: stored as unknown as Record<string, unknown>,
      selectedFactIds: selected,
      coverLetter: coverLetter.decision as "required" | "optional" | "not_requested" | "not_mentioned",
      language: job.language,
    }
    const [existing] = await db.select().from(applications).where(and(eq(applications.profileId, profile.id), eq(applications.jobId, job.id))).limit(1)
    const [application] = existing
      ? await db.update(applications).set(values).where(eq(applications.id, existing.id)).returning()
      : await db.insert(applications).values({ ...values, status: "analyzed", profileId: profile.id, jobId: job.id }).returning()
    if (existing) await advanceAutomatically(existing.id, "analyzed")
    await run.finish("succeeded", { applicationId: application.id, fitScore: result.fitScore })
    return application
  } catch (error) {
    await run.finish("failed", undefined, error instanceof Error ? error.message : String(error))
    throw error
  }
}

export async function listApplications() {
  return db.query.applications.findMany({ with: { job: { with: { company: true } } }, orderBy: [desc(applications.updatedAt)] })
}

export async function getApplication(id: string) {
  const application = await db.query.applications.findFirst({ where: eq(applications.id, id), with: { job: { with: { company: true } } } })
  if (!application) return null
  const factIds = (application.analysis as StoredAnalysis | null)?.requirements.flatMap((item) => item.factIds) ?? []
  const factRows = factIds.length
    ? await db.select({ id: facts.id, statement: facts.statement, entryId: facts.entryId, entryTitle: entries.title, display: entries.display, logoPath: entries.logoPath }).from(facts).innerJoin(entries, eq(facts.entryId, entries.id)).where(inArray(facts.id, [...new Set(factIds)]))
    : []
  return { ...application, analysis: application.analysis as StoredAnalysis | null, facts: factRows }
}

export async function applicationForJob(jobId: string) {
  return db.query.applications.findFirst({ where: eq(applications.jobId, jobId) })
}
