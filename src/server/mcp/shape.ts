/**
 * Plain JSON and text views of Naruvi data for MCP clients. Pure functions
 * (no database), so they are tested directly and shared by tools and resources.
 */
import { entryView, type EntryKind } from "@/lib/entry-fields"
import type { Analysis, MatchStatus, RequirementMatch } from "@/server/analysis/match"
import type { CvDocument } from "@/server/documents/model"
import type { LetterDocument } from "@/server/documents/letter"

/** A fact the analysis may cite, with the entry it belongs to. */
export type FactRef = { id: string; statement: string; entryId: string; entryTitle: string; entryKind: string }

type StoredFit = Analysis & { analyzedAt?: string; factCount?: number; coverLetter?: { decision: string; evidence: string } }

/** How strongly a requirement is backed, in words an agent can repeat. */
export const STRENGTH: Record<MatchStatus, string> = {
  met: "proven by verified facts",
  partial: "partly backed: related facts, not full proof",
  gap: "not backed by the verified profile",
  judgement: "not provable by facts (soft skill or context): the user's call",
}

export type FitFilter = "all" | MatchStatus

/** Every requirement with its status, the terms it covered or missed, and the facts that prove it. */
export function fitDetail(analysis: StoredFit, facts: FactRef[], filter: FitFilter = "all") {
  const byId = new Map(facts.map((fact) => [fact.id, fact]))
  const counts = analysis.counts
  const scored = counts.met + counts.partial + counts.gap
  const requirement = (match: RequirementMatch) => {
    const evidence = match.factIds.flatMap((id) => {
      const fact = byId.get(id)
      return fact ? [{ factId: fact.id, statement: fact.statement, entry: { id: fact.entryId, title: fact.entryTitle, kind: fact.entryKind } }] : []
    })
    return {
      id: match.id,
      text: match.text,
      kind: match.kind,
      section: match.section || null,
      status: match.status,
      strength: STRENGTH[match.status],
      covered: match.covered,
      missing: match.missing,
      years: match.years,
      note: match.note || null,
      evidence,
      // A cited fact that was since removed or un-verified no longer counts.
      staleEvidence: match.factIds.length - evidence.length,
    }
  }
  return {
    fit: scored > 0 ? analysis.fitScore : null,
    analyzedAt: analysis.analyzedAt ?? null,
    factsConsidered: analysis.factCount ?? null,
    counts: { proven: counts.met, partial: counts.partial, missing: counts.gap, yourCall: counts.judgement },
    mustHaveGaps: analysis.mustGaps,
    coverLetter: analysis.coverLetter ? { decision: analysis.coverLetter.decision, evidence: analysis.coverLetter.evidence } : null,
    recommendedEntries: analysis.recommendedEntries.map((entry) => ({ id: entry.entryId, title: entry.title, kind: entry.kind, requirementsBacked: entry.requirements })),
    keywords: analysis.keywords.slice(0, 25).map((keyword) => ({ keyword: keyword.key, mentions: keyword.count, inProfile: keyword.inProfile })),
    requirements: analysis.requirements.filter((match) => filter === "all" || match.status === filter).map(requirement),
  }
}

/** The CV as Markdown, in the order and wording it prints. Left-out sections, items and bullets are skipped. */
export function cvText(doc: CvDocument) {
  const lines = [`# ${doc.header.name}`]
  if (doc.header.headline) lines.push(`**${doc.header.headline}**`)
  const contact = [doc.header.email, doc.header.phone, doc.header.location, ...doc.header.links.map((link) => link.url)].filter(Boolean)
  if (contact.length) lines.push(contact.join(" · "))
  if (doc.header.summary) lines.push("", doc.header.summary)
  for (const section of doc.sections.filter((item) => item.included)) {
    lines.push("", `## ${section.title}`)
    for (const group of section.groups) lines.push(`- **${group.label}**: ${group.values.join(", ")}`)
    for (const item of section.items.filter((entry) => entry.included)) {
      const meta = [item.organization, item.location, item.dates].filter(Boolean).join(" · ")
      lines.push("", `### ${item.title}${meta ? ` (${meta})` : ""}`)
      for (const bullet of item.bullets.filter((entry) => entry.included)) lines.push(`- ${bullet.text}`)
    }
  }
  return lines.join("\n")
}

/** The cover letter as plain text, as it prints. */
export function letterText(doc: LetterDocument) {
  const paragraphs = doc.paragraphs.filter((paragraph) => paragraph.included && paragraph.text.trim())
  const highlights = doc.highlights.filter((item) => item.included)
  const body: string[] = []
  for (const paragraph of paragraphs) {
    body.push(paragraph.text)
    if (paragraph.kind === "highlights" && highlights.length) {
      if (doc.highlightsIntro) body.push(doc.highlightsIntro)
      body.push(highlights.map((item) => `- ${item.text}${item.organization ? ` (${item.organization})` : ""}`).join("\n"))
    }
  }
  return [doc.header.name, doc.date, doc.recipient.company, "", doc.subject, "", doc.salutation, "", ...body.flatMap((text) => [text, ""]), doc.signoff].join("\n")
}

export type EntryLikeForMcp = {
  id: string
  kind: string
  status: string
  display: unknown
  fields: unknown
  skills: string[]
  tags: string[]
  confidential: boolean
  doNotClaim: string[]
  facts: { id: string; statement: string }[]
}

/** One profile entry as an agent reads it. Facts are included only when asked for (they are the long part). */
export function entrySummary(entry: EntryLikeForMcp, language: string, { facts = true } = {}) {
  const view = entryView({ kind: entry.kind as EntryKind, display: entry.display as Record<string, Record<string, string>>, fields: entry.fields as Record<string, unknown> }, language)
  return {
    id: entry.id,
    kind: entry.kind,
    status: entry.status,
    title: view.heading || "Untitled",
    organization: view.subheading || null,
    dates: view.dates || null,
    location: view.location || null,
    details: view.details,
    link: view.link || null,
    skills: entry.skills,
    confidential: entry.confidential,
    doNotClaim: entry.doNotClaim,
    ...(facts ? { facts: entry.facts.map((fact) => ({ id: fact.id, statement: fact.statement })) } : { factCount: entry.facts.length }),
  }
}

export type ProfileLike = {
  fullName: string
  headlines: Record<string, string>
  summaries: Record<string, string>
  email: string
  phone: string
  location: string
  availability: string
  links: { label: string; url: string }[]
  defaultLanguage: string
  goals: unknown[]
}

/** Who the person is and what they look for, plus a count of entries per kind and status. */
export function profileSummary(profile: ProfileLike, entries: Pick<EntryLikeForMcp, "kind" | "status">[]) {
  const active = entries.filter((entry) => entry.status !== "archived")
  const byKind: Record<string, number> = {}
  for (const entry of active) byKind[entry.kind] = (byKind[entry.kind] ?? 0) + 1
  return {
    name: profile.fullName,
    headlines: profile.headlines,
    summaries: profile.summaries,
    email: profile.email || null,
    phone: profile.phone || null,
    location: profile.location || null,
    availability: profile.availability || null,
    links: profile.links,
    defaultLanguage: profile.defaultLanguage,
    goals: profile.goals,
    entries: { total: active.length, verified: active.filter((entry) => entry.status === "verified").length, needsReview: active.filter((entry) => entry.status === "needs_review").length, byKind },
    note: "Only verified entries count as evidence for fit analysis, CVs and letters.",
  }
}

/** The look new CVs and letters start from. */
export function styleSummary(defaults: { template: string; accent: string; showPhoto: boolean; design?: { [key: string]: unknown } | undefined; templateRef?: string | undefined }, templateName: string | null) {
  return {
    template: defaults.template,
    savedTemplate: defaults.templateRef ? { id: defaults.templateRef, name: templateName } : null,
    accent: defaults.accent,
    showPhoto: defaults.showPhoto,
    design: defaults.design ?? null,
    note: "Applied when a CV or letter is first generated. Change it on the Templates page in Naruvi.",
  }
}
