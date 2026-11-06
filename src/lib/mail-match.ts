/**
 * Link an email to one of the person's applications. Pure and deterministic:
 * replies to mail sent from Naruvi, the company's own domain, an applicant-
 * tracking system naming the company, or the company named in the subject.
 * Anything that does not match is ignored and never stored.
 */
import { titleSimilarity } from "./similar"

export type MatchMessage = { fromAddress: string; fromName: string; subject: string; text: string; inReplyTo?: string | null; references?: string[] }
export type MatchCandidate = { applicationId: string; company: string; website: string | null; title: string; sentMessageIds: string[]; active: boolean; updatedAt: number }
export type Match = { applicationId: string; reason: string; confidence: number }

/** Mail services hiring teams send from on behalf of a company. */
export const ATS_DOMAINS = ["greenhouse.io", "greenhouse-mail.io", "lever.co", "hire.lever.co", "ashbyhq.com", "smartrecruiters.com", "myworkday.com", "myworkdayjobs.com", "workday.com", "teamtailor.com", "teamtailor-mail.com", "welcometothejungle.com", "wttj.co", "recruitee.com", "workable.com", "workablemail.com", "jobvite.com", "icims.com", "successfactors.com", "taleo.net", "personio.de", "personio.com", "bamboohr.com", "breezy.hr", "jazzhr.com", "pinpointhq.com", "join.com", "homerun.co", "softgarden.de", "flatchr.io", "talent-soft.com", "linkedin.com", "indeed.com", "indeedemail.com"]

const FREE_MAIL = new Set(["gmail.com", "googlemail.com", "outlook.com", "hotmail.com", "live.com", "yahoo.com", "icloud.com", "me.com", "proton.me", "protonmail.com", "gmx.com", "gmx.de", "web.de", "orange.fr", "free.fr", "laposte.net", "aol.com"])
const TWO_PART_TLDS = new Set(["co.uk", "org.uk", "ac.uk", "com.au", "co.jp", "co.in", "com.br", "co.nz", "co.za", "com.mx", "com.tr", "com.cn"])

/** "mail.jobs.dashlane.com" → "dashlane.com" (good enough for matching, not a full public-suffix list). */
export function baseDomain(host: string): string {
  const parts = host.toLowerCase().replace(/^www\./, "").split(".").filter(Boolean)
  if (parts.length <= 2) return parts.join(".")
  const lastTwo = parts.slice(-2).join(".")
  return TWO_PART_TLDS.has(lastTwo) ? parts.slice(-3).join(".") : lastTwo
}

const domainOf = (address: string) => baseDomain(address.split("@")[1] ?? "")
const hostOf = (url: string | null) => {
  if (!url) return ""
  try {
    return baseDomain(new URL(url).hostname)
  } catch {
    return ""
  }
}
const isAts = (domain: string) => ATS_DOMAINS.some((ats) => domain === ats || domain.endsWith(`.${ats}`) || baseDomain(ats) === domain)

const normalize = (text: string) => text.toLowerCase().normalize("NFKD").replace(/\p{M}/gu, "")
/** Company name as a whole word or phrase ("Apple" must not match "pineapple"). */
export function mentions(haystack: string, company: string): boolean {
  const name = normalize(company).replace(/\b(sas|sa|inc|ltd|llc|gmbh|group|groupe)\b\.?/g, "").trim()
  if (name.length < 3) return false
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+")
  return new RegExp(`(^|[^\\p{L}\\p{N}])${escaped}($|[^\\p{L}\\p{N}])`, "u").test(normalize(haystack))
}

export function matchMessage(message: MatchMessage, candidates: MatchCandidate[]): Match | null {
  const threadIds = new Set([message.inReplyTo, ...(message.references ?? [])].filter(Boolean) as string[])
  const replied = candidates.find((candidate) => candidate.sentMessageIds.some((id) => threadIds.has(id)))
  if (replied) return { applicationId: replied.applicationId, reason: "Reply to an email you sent from Naruvi", confidence: 1 }

  const from = domainOf(message.fromAddress)
  const head = `${message.fromName} ${message.subject}`
  const body = message.text.slice(0, 4000)
  const scored: (Match & { title: number; active: boolean; updatedAt: number })[] = []
  for (const candidate of candidates) {
    const site = hostOf(candidate.website)
    let confidence = 0
    let reason = ""
    if (site && from === site && !FREE_MAIL.has(from)) {
      confidence = 0.9
      reason = `Sent from ${site}`
    } else if (isAts(from) && (mentions(head, candidate.company) || mentions(body, candidate.company))) {
      confidence = 0.8
      reason = `Hiring system email naming ${candidate.company}`
    } else if (mentions(head, candidate.company)) {
      confidence = 0.6
      reason = `${candidate.company} in the ${mentions(message.subject, candidate.company) ? "subject" : "sender name"}`
    }
    if (!confidence) continue
    scored.push({ applicationId: candidate.applicationId, reason, confidence, title: Math.max(titleSimilarity(message.subject, candidate.title), mentions(`${message.subject} ${body}`, candidate.title) ? 1 : 0), active: candidate.active, updatedAt: candidate.updatedAt })
  }
  if (!scored.length) return null
  // Several applications at one company: the role named in the email wins, then active, then most recent.
  scored.sort((a, b) => b.confidence - a.confidence || b.title - a.title || Number(b.active) - Number(a.active) || b.updatedAt - a.updatedAt)
  const best = scored[0]
  const sameCompany = scored.filter((item) => item.confidence === best.confidence)
  const unsure = sameCompany.length > 1 && best.title < 0.5
  return { applicationId: best.applicationId, reason: unsure ? `${best.reason} (several roles there; check it’s this one)` : best.reason, confidence: unsure ? best.confidence - 0.2 : best.confidence }
}
