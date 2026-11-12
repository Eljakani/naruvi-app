/**
 * Requirements extraction from a job description. Pure.
 * Uses the same block model as the UI (headings, lists, paragraphs), then
 * classifies sections by their heading.
 */
import { parseJobText } from "@/lib/job-text"
import { keywordsIn, termsIn } from "./keywords"

export type RequirementKind = "must" | "nice" | "responsibility"
export type Requirement = { id: string; text: string; kind: RequirementKind; section: string; keywords: string[]; terms?: string[]; years: number | null; /** The sentence just before a list ("Cela se traduit par exemple par :"), as context. */ lead?: string }

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
  if (/^(?:benefits?|perks|avantages|salary|rémunération|what we offer|ce que nous (?:offrons|proposons)|ce qu['’]on (?:vous )?(?:offre|propose)|nos avantages|les \+|les plus|pourquoi (?:nous )?rejoindre|why (?:join|work)|what['’]s in it for you|life at|la vie (?:chez|à|au)|vie d['’]équipe|team life|on vous offre|we offer)/i.test(heading)) return "benefits"
  if (/^(?:about (?:us|the company)|à propos|who we are|our company|qui sommes-nous)/i.test(heading)) return "company_information"
  if (/^(?:how to apply|apply now|comment postuler|pour postuler|modalités de candidature)/i.test(heading)) return "application_instructions"
  return SKIP.test(heading) ? "other" : null
}

/** Strong labels describe a step the applicant goes through, not a skill they need. */
export function isRecruitmentStep(text: string): boolean {
  return /^(?:[ée]change(?:s)?\s+(?:rh|op[ée]rationnel(?:le)?|technique)|entretien\s+(?:rh|technique|op[ée]rationnel|t[ée]l[ée]phonique)|(?:hr|technical|final|recruiter)\s+(?:interview|screening)|interview\s+(?:stage|step))\s*[:–—-]/i.test(text.trim())
}

/**
 * What the employer offers or how the team lives: events, afterworks, food, perks,
 * insurance, leave, equity. Found anywhere in a posting (often mixed into the profile
 * list), it's never a candidate requirement. Items that also state a skill or
 * experience are left alone.
 */
const PERK = /\b(?:after[- ]?works?|team[- ]?buildings?|s[ée]minaires?|soir[ée]es?|f[êe]tes?|[ée]v[ée]nements?|[eè]v[eè]nements?|events?(?![- ](?:driven|sourcing|streaming|bus|loop|store))|petits?[- ]d[ée]jeuners?|breakfasts?|snacks?|fruits?|caf[ée]s? offerts?|free (?:lunch|coffee|food)|catered|baby[- ]?foot|ping[- ]?pong|tickets?[- ](?:resto|restaurant)|carte (?:swile|tr|d[ée]jeuner)|swile|mutuelle|pr[ée]voyance|health (?:insurance|care)|rtt|cong[ée]s?|jours? (?:off|de cong[ée]s)|paid (?:time off|leave)|pto|vacations?|salle de sport|gym(?:pass)?|abonnement|navigo|forfait mobilit[ée]|comit[ée] d['’]entreprise|\bcse\b|int[ée]ressement|participation aux b[ée]n[ée]fices|bspce|stock[- ]options|equity|surprises?|goodies|rooftop|terrasse|locaux|bureaux (?:spacieux|lumineux|neufs|en plein)|remote allowance|home office allowance)\b/i
const CANDIDATE_TERMS = /exp[ée]rience|ma[iî]tris|connaissance|comp[ée]tence|savoir|skills?|knowledge|proficien|years?|ans\b|dipl[ôo]m|degree|master|bac\s*\+|certif|fluent|courant|niveau|capacit[ée]|ability|able to|vous (?:[êe]tes|avez|savez)|you (?:are|have|can)/i

export function isEmployerPerk(text: string): boolean {
  return PERK.test(text) && !CANDIDATE_TERMS.test(text)
}

const EXCLUDED_REASONS: Record<ExclusionCategory, string> = {
  recruitment_process: "Describes the hiring or interview process, not a candidate requirement.",
  benefits: "Describes compensation or benefits offered by the employer.",
  company_information: "Describes the company rather than a candidate qualification or duty.",
  application_instructions: "Explains how to apply rather than what the candidate needs to demonstrate.",
  other: "Outside a recognized requirements or responsibilities section.",
}

/**
 * A paragraph that introduces examples of how the company works ("Cela se traduit
 * par exemple par :", "This means:"): the list after it describes the company.
 */
const INTRODUCES_PRACTICES = /(?:se traduit (?:notamment |concrètement )?par(?: exemple)?(?: par)?|concrètement|this (?:means|translates (?:into|to))|in practice|for example|par exemple|zum beispiel|en la práctica)\s*:\s*$/i

/**
 * A sentence in running text that states what the candidate must know or have
 * ("Côté compétences, vous maîtrisez GitLab et AWS.", "You have 5+ years of
 * experience with Go"). Lists are not the only place postings put requirements.
 */
const REQUIREMENT_SENTENCE = /\b(?:vous ma[iî]trisez|vous (?:avez|possédez|disposez d['’]) (?:une |un |de l['’]|des |d['’])?(?:bonne |solide |excellente |réelle |première )?(?:connaissance|expérience|maîtrise|expertise|pratique)|(?:maîtrise|connaissance (?:avancée |approfondie )?) (?:de|d['’]|du|des)|\d+\s*\+?\s*(?:ans|années) d['’]expérience|you (?:have|bring|know|are fluent|master)\b|(?:hands-on |strong |solid |proven )?experience (?:with|in|using|of)|\d+\s*\+?\s*years? of (?:professional |relevant )?experience|proficien(?:t|cy) (?:in|with)|knowledge of|(?:is |are )?(?:required|a must)|must have|sie (?:haben|verfügen über|beherrschen)|(?:erfahrung|kenntnisse) (?:mit|in|im)|experiencia (?:en|con)|años de experiencia|conocimientos? de)/i

const sentences = (text: string) => text.split(/(?<=[.!?])\s+(?=\p{Lu})/u).map((sentence) => sentence.trim()).filter(Boolean)

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
  let practices = false
  let lead = ""
  for (const block of blocks) {
    if (block.type === "heading") {
      heading = block.text
      kind = classify(heading)
      sectionExclusion = excludedSection(heading)
      practices = false
      lead = ""
      continue
    }
    if (block.type === "paragraph") {
      practices = INTRODUCES_PRACTICES.test(block.text)
      lead = (sentences(block.text).at(-1) ?? "").slice(0, 200)
      if (sectionExclusion) continue
      for (const sentence of sentences(block.text)) {
        if (sentence.length > 400 || !REQUIREMENT_SENTENCE.test(sentence)) continue
        const requirement: Requirement = { id: `r${candidates.length + 1}`, text: sentence, kind: NICE.test(sentence) ? "nice" : "must", section: heading, keywords: keywordsIn(sentence), terms: termsIn(sentence), years: years(sentence) }
        candidates.push(requirement)
        preferred.push(requirement)
      }
      continue
    }
    if (block.type !== "list") continue
    const listExclusion = sectionExclusion ?? (practices ? "company_information" : null)
    practices = false
    for (const item of block.items) {
      const itemKind: RequirementKind = kind !== "responsibility" && /\b(a plus|un plus|bonus|nice to have|preferred|idéalement|appréci)/i.test(item) ? "nice" : kind ?? "must"
      const requirement: Requirement = { id: `r${candidates.length + 1}`, text: item, kind: itemKind, section: heading, keywords: keywordsIn(item), terms: termsIn(item), years: years(item), ...(lead ? { lead } : {}) }
      candidates.push(requirement)
      const category = isRecruitmentStep(item) ? "recruitment_process" : isEmployerPerk(item) ? "benefits" : listExclusion
      if (category) excluded.push({ requirement, category, source: "rules", reason: EXCLUDED_REASONS[category] })
      else if (kind) preferred.push(requirement)
      else fallback.push(requirement)
    }
  }
  // Never reintroduce explicitly excluded benefits/interview steps through fallback.
  const requirements = dedupe(preferred.length ? preferred : fallback, candidates)
  if (preferred.length) for (const requirement of fallback) excluded.push({ requirement, category: "other", source: "rules", reason: EXCLUDED_REASONS.other })
  return { candidates, requirements, excluded }
}

/** Salary, contract and place details: an offer sentence that also happens to mention experience. */
const OFFER_NOISE = /\d\s*[kK]?\s*[€$£]|[€$£]\s*\d|\b(?:salaire|rémunération|salary|compensation|gehalt|salario|CDI|CDD|full[- ]time|part[- ]time|télétravail|remote)\b/i

/**
 * Postings often repeat the same minimum ("5 years", once in the intro next to
 * the salary, once in the profile). Keep one per years value when neither names
 * a specific skill: the cleaner sentence wins. Removed duplicates leave the
 * candidate list too, so a model can't put them back.
 */
function dedupe(requirements: Requirement[], candidates: Requirement[]): Requirement[] {
  // Known skills only: capitalised words like a city ("Rennes") don't make a sentence specific.
  const skillful = (item: Requirement) => item.keywords.length > 0
  const byYears = new Map<number, Requirement[]>()
  for (const item of requirements) if (item.years !== null && !skillful(item)) byYears.set(item.years, [...(byYears.get(item.years) ?? []), item])
  const drop = new Set<string>()
  for (const group of byYears.values()) {
    if (group.length < 2) continue
    const best = [...group].sort((a, b) => Number(OFFER_NOISE.test(a.text)) - Number(OFFER_NOISE.test(b.text)) || a.text.length - b.text.length)[0]
    for (const item of group) if (item !== best) drop.add(item.id)
  }
  if (!drop.size) return requirements
  for (let index = candidates.length - 1; index >= 0; index -= 1) if (drop.has(candidates[index].id)) candidates.splice(index, 1)
  return requirements.filter((item) => !drop.has(item.id))
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
