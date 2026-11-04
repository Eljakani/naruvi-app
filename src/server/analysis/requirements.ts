/**
 * Requirements extraction from a job description. Pure.
 * Uses the same block model as the UI (headings, lists, paragraphs), then
 * classifies sections by their heading.
 */
import { parseJobText } from "@/lib/job-text"
import { keywordsIn } from "./keywords"

export type RequirementKind = "must" | "nice" | "responsibility"
export type Requirement = { id: string; text: string; kind: RequirementKind; section: string; keywords: string[]; years: number | null }

const NICE = /nice to have|bonus|\bplus\b|preferred|desirable|ideally|un plus|appréci|souhait|optionnel|would be great/i
const MUST = /require|qualification|looking for|what you bring|you (?:have|bring)|must|profil|expertise|compétences|skills|experience|about you|who you are|your background|ce que nous recherchons|vous (?:avez|êtes)|critical competencies/i
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
  const match = text.match(/(\d{1,2})\s*\+?\s*(?:years?|ans|années)/i)
  return match ? Number(match[1]) : null
}

export function extractRequirements(rawText: string): Requirement[] {
  const blocks = parseJobText(rawText)
  const out: Requirement[] = []
  let heading = ""
  let kind: RequirementKind | null = null
  for (const block of blocks) {
    if (block.type === "heading") {
      heading = block.text
      kind = classify(block.text)
      continue
    }
    if (block.type !== "list" || !kind) continue
    for (const item of block.items) {
      // An item can itself say "(nice to have)" / "is a plus".
      const itemKind: RequirementKind = kind !== "responsibility" && /\b(a plus|un plus|bonus|nice to have|preferred|idéalement|appréci)/i.test(item) ? "nice" : kind
      out.push({ id: `r${out.length + 1}`, text: item, kind: itemKind, section: heading, keywords: keywordsIn(item), years: years(item) })
    }
  }
  // No usable headings: treat every bullet as a requirement rather than nothing.
  if (!out.length) {
    for (const block of blocks) {
      if (block.type !== "list") continue
      for (const item of block.items) out.push({ id: `r${out.length + 1}`, text: item, kind: "must", section: "", keywords: keywordsIn(item), years: years(item) })
    }
  }
  return out
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
