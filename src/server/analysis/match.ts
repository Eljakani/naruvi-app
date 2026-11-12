/**
 * Match job requirements to verified profile facts. Pure and deterministic.
 *
 * Rules (honest by construction):
 * - "met" needs every skill the requirement names to appear in a fact
 *   statement (tags/skills on the entry alone are weaker evidence → partial).
 * - "partial" means some of it is backed, or only by entry-level tags.
 * - "gap" means nothing in the profile backs any named skill.
 * - "judgement" is for soft skills or claims a profile cannot prove (years,
 *   attitudes): shown to the user, excluded from the score, never assumed.
 */
import { RELATED, hasTerm, keywordFrequency, keywordLabel, keywordsIn, namedTools } from "./keywords"
import type { Requirement } from "./requirements"

export type ProfileFact = {
  id: string
  statement: string
  entryId: string
  entryTitle: string
  entryKind: string
  entryTags: string[]
  entrySkills: string[]
  /** The statement in the other CV languages (automatic translations), so a French fact meets an English job. */
  translations?: string[]
}

/** Everything a fact says, in every language it is written in. */
export function factText(fact: Pick<ProfileFact, "statement" | "translations">) {
  const others = [...new Set((fact.translations ?? []).map((text) => text.trim()).filter((text) => text && text !== fact.statement.trim()))]
  return [fact.statement, ...others].join(" \n ")
}

/** The statement for a model prompt, with its translations when they differ. */
export function factForPrompt(fact: Pick<ProfileFact, "statement" | "translations">) {
  const others = [...new Set((fact.translations ?? []).map((text) => text.trim()).filter((text) => text && text !== fact.statement.trim()))]
  return others.length ? `${fact.statement} (${others.map((text) => `= "${text}"`).join(" ")})` : fact.statement
}

export type MatchStatus = "met" | "partial" | "gap" | "judgement"

export type RequirementMatch = Requirement & {
  status: MatchStatus
  factIds: string[]
  covered: string[]
  missing: string[]
  note: string
  source: "rules" | "model"
}

const STOP = new Set(
  "a an and the of to in for with on at by from as is are be or your you our we us their this that will can able ability experience experienced strong good solid knowledge understanding familiarity proficiency working work using use etc including such like de la le les des du et en pour avec sur un une au aux par dans vous votre nos notre maîtrise connaissance expérience bonne solide".split(" "),
)

function tokens(text: string) {
  return new Set(
    (text.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").match(/[a-z0-9][a-z0-9+#.-]*/g) ?? []).filter((word) => word.length > 2 && !STOP.has(word)),
  )
}

function overlap(a: Set<string>, b: Set<string>) {
  if (!a.size || !b.size) return 0
  let shared = 0
  for (const word of a) if (b.has(word)) shared += 1
  return shared / Math.min(a.size, b.size)
}

type Indexed = ProfileFact & { text: string; stmtKeywords: Set<string>; entryKeywords: Set<string>; words: Set<string> }

export function indexFacts(facts: ProfileFact[]): Indexed[] {
  return facts.map((fact) => ({
    ...fact,
    text: factText(fact),
    stmtKeywords: new Set(keywordsIn(factText(fact))),
    entryKeywords: new Set(keywordsIn([fact.entryTitle, ...fact.entryTags, ...fact.entrySkills].join(" , "))),
    words: tokens(factText(fact)),
  }))
}

/** Tool-like terms (CPA, ServiceNow, AutoCAD) are evidence-bearing skills; plain proper nouns are not. */
export function toolLike(term: string, source: string) {
  const label = keywordLabel(term, source)
  return /^[A-Z0-9+#&]{2,}$/.test(label) || /[a-z][A-Z]|[A-Z].*\s[A-Z]|\d|[+#]/.test(label)
}

export function matchRequirement(requirement: Requirement, facts: Indexed[]): RequirementMatch {
  const result = matchKeywords(requirement, facts)
  const terms = requirement.terms ?? []
  if (!terms.length) return result
  // Terms: found anywhere in a fact statement (or entry skills) counts.
  const termFacts = facts.filter((fact) => terms.some((term) => hasTerm(fact.text, term)))
  const coveredTerms = terms.filter((term) => facts.some((fact) => hasTerm(fact.text, term) || hasTerm(fact.entrySkills.join(" , "), term)))
  const missingTools = terms.filter((term) => !coveredTerms.includes(term) && toolLike(term, requirement.text))
  const label = (term: string) => keywordLabel(term, requirement.text)
  const factIds = [...new Set([...result.factIds, ...termFacts.slice(0, 2).map((fact) => fact.id)])].slice(0, 3)
  const covered = [...result.covered, ...coveredTerms.map(label)]
  const missing = [...result.missing, ...missingTools.map(label)]
  if (!requirement.keywords.length) {
    if (missingTools.length && !coveredTerms.length) return { ...result, status: "gap", factIds: [], covered, missing, note: `Nothing in your verified profile mentions ${missingTools.map(label).join(", ")}. Don't claim it.` }
    if (coveredTerms.length && !missingTools.length) return { ...result, status: termFacts.length ? "met" : "partial", factIds, covered, missing, note: termFacts.length ? result.note.replace(/^Not something.*$/, "") : `${coveredTerms.map(label).join(", ")} only appears in entry skills, not in a fact.` }
    if (coveredTerms.length) return { ...result, status: "partial", factIds, covered, missing, note: `No fact mentions ${missingTools.map(label).join(", ")}.` }
    return result
  }
  if (result.status === "met" && missingTools.length) return { ...result, status: "partial", factIds, covered, missing, note: `No fact mentions ${missingTools.map(label).join(", ")}.` }
  return { ...result, factIds, covered, missing }
}

function matchKeywords(requirement: Requirement, facts: Indexed[]): RequirementMatch {
  const wanted = requirement.keywords
  const reqWords = tokens(requirement.text)
  // "Power BI or Tableau": a fact about dashboards is related, not proof.
  const named = Object.fromEntries(wanted.map((key) => [key, namedTools(key, requirement.text)]))
  const statementProves = (fact: Indexed, key: string) =>
    fact.stmtKeywords.has(key) && (named[key].length === 0 || named[key].some((name) => hasTerm(fact.text, `term:${name}`)))
  const scored = facts
    .map((fact) => {
      const stmtHits = wanted.filter((key) => statementProves(fact, key))
      const entryHits = wanted.filter((key) => !statementProves(fact, key) && (fact.entryKeywords.has(key) || fact.stmtKeywords.has(key)))
      const lexical = overlap(reqWords, fact.words)
      return { fact, stmtHits, entryHits, lexical, score: stmtHits.length * 2 + entryHits.length * 0.75 + lexical * 1.5 }
    })
    .filter((item) => item.stmtHits.length || item.entryHits.length || item.lexical >= 0.34)
    .sort((a, b) => b.score - a.score)

  const top = scored.slice(0, 4)
  const coveredByStatements = new Set(top.flatMap((item) => item.stmtHits))
  const coveredByEntries = new Set(scored.flatMap((item) => item.entryHits))
  const covered = wanted.filter((key) => coveredByStatements.has(key) || coveredByEntries.has(key))
  const missing = wanted.filter((key) => !covered.includes(key))
  const base = { ...requirement, covered, missing, source: "rules" as const }
  const evidence = top.filter((item) => item.stmtHits.length || item.entryHits.length || item.lexical >= 0.34).map((item) => item.fact.id)
  const yearsNote = requirement.years ? ` Your profile can't prove ${requirement.years}+ years by itself — check your dates.` : ""

  if (!wanted.length) {
    const best = scored[0]
    if (best && best.lexical >= 0.5) {
      return { ...base, status: "partial", factIds: evidence.slice(0, 3), note: `Related facts found; whether they satisfy this is your call.${yearsNote}` }
    }
    return { ...base, status: "judgement", factIds: [], note: `Not something facts can prove (soft skill or context). Decide yourself whether it fits.${yearsNote}` }
  }
  if (missing.length === 0 && wanted.every((key) => coveredByStatements.has(key))) {
    // Coursework proves knowledge, not practice: "familiarity with X" can be met
    // by a degree, "perform X" needs something you actually did.
    const knowledge = /familiar|understanding|knowledge|aware|exposure|connaissance|notions?|sensibilis|certif|degree|diploma|dipl[ôo]me|licen[cs]e|bachelor|master|bac\s*\+|qualification/i.test(requirement.text)
    const practiced = new Set(top.filter((item) => !ACADEMIC.has(item.fact.entryKind)).flatMap((item) => item.stmtHits))
    if (!knowledge && !wanted.every((key) => practiced.has(key))) {
      const academic = wanted.filter((key) => !practiced.has(key))
      return { ...base, status: "partial", factIds: evidence.slice(0, 3), note: `${academic.join(", ")} is only backed by coursework or a certification, not hands-on work.${yearsNote}`.trim() }
    }
    return { ...base, status: "met", factIds: evidence.slice(0, 3), note: yearsNote.trim() }
  }
  if (covered.length) {
    const weak = covered.filter((key) => !coveredByStatements.has(key))
    const parts = [missing.length ? `No fact mentions ${missing.join(", ")}.` : "", weak.length ? `${weak.join(", ")} only appears in entry tags/skills, not in a fact.` : ""].filter(Boolean)
    return { ...base, status: "partial", factIds: evidence.slice(0, 3), note: `${parts.join(" ")}${yearsNote}`.trim() }
  }
  // Nothing direct — but proven related skills make it "partly", with a clear note.
  const related = [...new Set(wanted.flatMap((key) => RELATED[key] ?? []))]
  const relatedFacts = facts.filter((fact) => related.some((key) => fact.stmtKeywords.has(key))).slice(0, 3)
  if (relatedFacts.length) {
    const shown = related.filter((key) => relatedFacts.some((fact) => fact.stmtKeywords.has(key)))
    return { ...base, status: "partial", factIds: relatedFacts.map((fact) => fact.id), note: `No fact mentions ${wanted.join(", ")} directly; related evidence: ${shown.join(", ")}. Describe it with those words, not as ${wanted.join(", ")}.${yearsNote}`.trim() }
  }
  return { ...base, status: "gap", factIds: [], note: `Nothing in your verified profile mentions ${wanted.join(", ")}. Don't claim it.` }
}

const ACADEMIC = new Set(["education", "certification"])

const WEIGHT: Record<Requirement["kind"], number> = { must: 1, responsibility: 0.6, nice: 0.4 }
const VALUE: Record<Exclude<MatchStatus, "judgement">, number> = { met: 1, partial: 0.5, gap: 0 }

export type Analysis = {
  version: 1
  fitScore: number | null
  counts: Record<MatchStatus, number>
  requirements: RequirementMatch[]
  keywords: { key: string; count: number; inProfile: boolean }[]
  recommendedEntries: { entryId: string; title: string; kind: string; requirements: number }[]
  mustGaps: string[]
}

/** Older analyses stored zero even when no requirements could be scored. */
export function displayFitScore(analysis: Pick<Analysis, "fitScore" | "counts"> | null | undefined) {
  if (!analysis) return null
  const { met, partial, gap } = analysis.counts
  return met + partial + gap > 0 ? analysis.fitScore : null
}

/** Score, keyword coverage and which entries a CV for this job should lead with. */
export function summarize(matches: RequirementMatch[], facts: ProfileFact[], jobText: string): Analysis {
  let sum = 0
  let weight = 0
  for (const match of matches) {
    if (match.status === "judgement") continue
    sum += WEIGHT[match.kind] * VALUE[match.status]
    weight += WEIGHT[match.kind]
  }
  const counts = { met: 0, partial: 0, gap: 0, judgement: 0 } as Record<MatchStatus, number>
  for (const match of matches) counts[match.status] += 1

  const profileKeywords = new Set(keywordsIn(facts.map((fact) => [factText(fact), ...fact.entrySkills, ...fact.entryTags].join(" , ")).join(" \n ")))
  const keywords = keywordFrequency(jobText)
    .slice(0, 16)
    .map((item) => ({ ...item, inProfile: profileKeywords.has(item.key) }))

  const byEntry = new Map<string, { entryId: string; title: string; kind: string; requirements: number }>()
  for (const match of matches) {
    if (match.status === "gap" || match.status === "judgement") continue
    const entries = new Set(match.factIds.map((id) => facts.find((fact) => fact.id === id)?.entryId).filter(Boolean) as string[])
    for (const entryId of entries) {
      const fact = facts.find((item) => item.entryId === entryId)!
      const current = byEntry.get(entryId) ?? { entryId, title: fact.entryTitle, kind: fact.entryKind, requirements: 0 }
      current.requirements += WEIGHT[match.kind]
      byEntry.set(entryId, current)
    }
  }

  return {
    version: 1,
    fitScore: weight ? Math.round((sum / weight) * 100) : null,
    counts,
    requirements: matches,
    keywords,
    recommendedEntries: [...byEntry.values()].sort((a, b) => b.requirements - a.requirements).map((item) => ({ ...item, requirements: Number(item.requirements.toFixed(1)) })),
    mustGaps: matches.filter((match) => match.kind === "must" && match.status === "gap").map((match) => match.text),
  }
}

export function analyze(requirements: Requirement[], facts: ProfileFact[], jobText: string): Analysis {
  const indexed = indexFacts(facts)
  return summarize(requirements.map((requirement) => matchRequirement(requirement, indexed)), facts, jobText)
}

/** Best candidate facts for a requirement (for model review), most relevant first. */
export function candidateFacts(requirement: Requirement, facts: Indexed[], limit = 6) {
  const words = tokens(requirement.text)
  return facts
    .map((fact) => ({
      fact,
      score:
        requirement.keywords.filter((key) => fact.stmtKeywords.has(key)).length * 2 +
        requirement.keywords.filter((key) => fact.entryKeywords.has(key)).length * 0.5 +
        (requirement.terms ?? []).filter((term) => hasTerm(fact.text, term)).length * 2 +
        overlap(words, fact.words),
    }))
    .filter((item) => item.score > 0.2)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ fact }) => ({ id: fact.id, statement: factForPrompt(fact), entry: fact.entryTitle, kind: fact.entryKind }))
}
