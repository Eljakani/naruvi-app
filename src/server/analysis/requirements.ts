/**
 * Requirements extraction from a job description. Pure.
 * Uses the same block model as the UI (headings, lists, paragraphs), then
 * classifies sections by their heading.
 */
import { parseJobText } from "@/lib/job-text"
import { keywordsIn, termsIn } from "./keywords"

export type RequirementKind = "must" | "nice" | "responsibility"
export type Requirement = { id: string; text: string; kind: RequirementKind; section: string; keywords: string[]; terms?: string[]; years: number | null }

const NICE = /nice to have|bonus|\bplus\b|preferred|desirable|ideally|un plus|appréci|souhait|optionnel|would be great/i
const MUST = /require|qualification|looking for|what you bring|you (?:have|bring)|must|profil|expertise|compétences|skills|experience|about you|who you are|your background|ce que nous recherchons|vous (?:avez|êtes)|critical competencies|meet you if|ideal candidate|you are|you'll need|what we're looking for|nous recherchons|candidat idéal/i
const RESPONSIBILITY = /you(?:'ll| will)|responsibilit|what you.?ll do|day[- ]to[- ]day|missions?|livrables|key tasks|the role|your role|in this role|tasks|vos missions|vous (?:serez|allez)|at .+ you will/i
const SKIP = /benefit|offer|perks|avantages|salary|rémunération|diversity|inclusion|equal|about (?:us|the company)|à propos|who we are|process|interview|how to apply|location|our tech|why join|culture|life at/i

function classify(heading: string): RequirementKind | null {
  if (!heading) return null
  if (NICE.test(heading)) return "nice"
  if (SKIP.test(heading)) return null
  if (MUST.test(heading)) return "must"
  if (RESPONSIBILITY.test(heading)) return "responsibility"
  return null
}

function years(text: string): number | null {
  // "3-5+ years" → 3 (the minimum is the requirement), "5+ years" → 5.
  const match = text.match(/(\d{1,2})\s*\+?\s*(?:(?:-|–|to|à)\s*\d{1,2}\s*\+?\s*)?(?:years?|yrs|ans|années)/i)
  return match ? Number(match[1]) : null
}

export type ExclusionCategory = "recruitment_process" | "benefits" | "company_information" | "application_instructions" | "other"
export type ExcludedRequirement = { requirement: Requirement; category: ExclusionCategory; reason: string; source: "rules" | "model" }
export type RequirementExtraction = { candidates: Requirement[]; requirements: Requirement[]; excluded: ExcludedRequirement[] }

function excludedSection(heading: string): ExclusionCategory | null {
  if (/(?:recruitment|hiring|interview) (?:process|steps|stages|experience)|how (?:we|to) (?:hire|apply)|(?:processus|process|étapes?|déroulement).*(?:recrutement|entretien|candidature)|^(?:interviews?|entretiens?)$/i.test(heading)) return "recruitment_process"
  if (/^(?:benefits?|perks|avantages|salary|rémunération|what we offer|ce que nous (?:offrons|proposons))/i.test(heading)) return "benefits"
  if (/^(?:about (?:us|the company)|à propos|who we are|our company|qui sommes-nous)/i.test(heading)) return "company_information"
  if (/^(?:how to apply|apply now|comment postuler|pour postuler|modalités de candidature)/i.test(heading)) return "application_instructions"
  return SKIP.test(heading) ? "other" : null
}

/** Strong labels describe a step the applicant goes through, not a skill they need. */
export function isRecruitmentStep(text: string): boolean {
  return /^(?:[ée]change(?:s)?\s+(?:rh|op[ée]rationnel(?:le)?|technique)|entretien\s+(?:rh|technique|op[ée]rationnel|t[ée]l[ée]phonique)|(?:hr|technical|final|recruiter)\s+(?:interview|screening)|interview\s+(?:stage|step))\s*[:–—-]/i.test(text.trim())
}

const EXCLUDED_REASONS: Record<ExclusionCategory, string> = {
  recruitment_process: "Describes the hiring or interview process, not a candidate requirement.",
  benefits: "Describes compensation or benefits offered by the employer.",
  company_information: "Describes the company rather than a candidate qualification or duty.",
  application_instructions: "Explains how to apply rather than what the candidate needs to demonstrate.",
  other: "Outside a recognized requirements or responsibilities section.",
}

/** Keep all source candidates for AI classification, with a conservative rules-only baseline. */
export function extractRequirementCandidates(rawText: string): RequirementExtraction {
  const blocks = parseJobText(rawText)
  const candidates: Requirement[] = []
  const preferred: Requirement[] = []
  const fallback: Requirement[] = []
  const excluded: ExcludedRequirement[] = []
  let heading = ""
  let kind: RequirementKind | null = null
  let sectionExclusion: ExclusionCategory | null = null
  for (const block of blocks) {
    if (block.type === "heading") {
      heading = block.text
      kind = classify(heading)
      sectionExclusion = excludedSection(heading)
      continue
    }
    if (block.type !== "list") continue
    for (const item of block.items) {
      const itemKind: RequirementKind = kind !== "responsibility" && /\b(a plus|un plus|bonus|nice to have|preferred|idéalement|appréci)/i.test(item) ? "nice" : kind ?? "must"
      const requirement: Requirement = { id: `r${candidates.length + 1}`, text: item, kind: itemKind, section: heading, keywords: keywordsIn(item), terms: termsIn(item), years: years(item) }
      candidates.push(requirement)
      const category = isRecruitmentStep(item) ? "recruitment_process" : sectionExclusion
      if (category) excluded.push({ requirement, category, source: "rules", reason: EXCLUDED_REASONS[category] })
      else if (kind) preferred.push(requirement)
      else fallback.push(requirement)
    }
  }
  // Never reintroduce explicitly excluded benefits/interview steps through fallback.
  const requirements = preferred.length ? preferred : fallback
  if (preferred.length) for (const requirement of fallback) excluded.push({ requirement, category: "other", source: "rules", reason: EXCLUDED_REASONS.other })
  return { candidates, requirements, excluded }
}

export function extractRequirements(rawText: string): Requirement[] {
  return extractRequirementCandidates(rawText).requirements
}

export type CoverLetterDecision = "required" | "optional" | "not_requested" | "not_mentioned"

/** Same four-way decision the my-cv workflow uses. */
export function coverLetterDecision(rawText: string): { decision: CoverLetterDecision; evidence: string } {
  const text = String(rawText ?? "")
  const find = (pattern: RegExp) => text.match(new RegExp(`[^.\\n]*${pattern.source}[^.\\n]*`, "i"))?.[0]?.trim() ?? ""
  const letter = /(cover letter|motivation letter|lettre de motivation|letter of motivation)/
  const negative = find(new RegExp(`(no|not required|without|pas de|sans|non requise?)[^.\\n]{0,30}${letter.source}|${letter.source}[^.\\n]{0,30}(not required|not necessary|non requise?|pas nécessaire|optional? not)`))
  if (negative && !/optional|facultative?/i.test(negative)) return { decision: "not_requested", evidence: negative }
  const optional = find(new RegExp(`${letter.source}[^.\\n]{0,40}(optional|facultative?|if you wish|si vous le souhaitez)|(optional|facultative?)[^.\\n]{0,40}${letter.source}`))
  if (optional) return { decision: "optional", evidence: optional }
  const mention = find(letter)
  if (mention) return { decision: "required", evidence: mention }
  return { decision: "not_mentioned", evidence: "" }
}
