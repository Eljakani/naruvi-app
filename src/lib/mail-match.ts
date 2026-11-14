/**
 * Link an email to one of the person's applications. Pure and deterministic:
 * thread history, known recruiters, company names/domains, role titles,
 * and application-related wording in the subject, body and signature.
 * Anything that does not match is ignored and never stored.
 */
import { titleWords } from "./similar"
import { ALERT_SENDERS, canonicalJobUrl } from "./job-alerts"
import { ruleKind } from "./mail-classify"

export type MatchMessage = { fromAddress: string; fromName: string; subject: string; text: string; inReplyTo?: string | null; references?: string[]; toAddresses?: string[]; /** Sent to a list (List-Id, List-Unsubscribe or Precedence: bulk headers). */ bulk?: boolean }
export type MatchCandidate = { applicationId: string; company: string; website: string | null; title: string; sentMessageIds: string[]; active: boolean; updatedAt: number; contactEmails?: string[]; contactNames?: string[] }
export type Match = { applicationId: string; reason: string; confidence: number }

/** Mail services hiring teams send from on behalf of a company. */
export const ATS_DOMAINS = ["greenhouse.io", "greenhouse-mail.io", "lever.co", "hire.lever.co", "ashbyhq.com", "smartrecruiters.com", "myworkday.com", "myworkdayjobs.com", "workday.com", "teamtailor.com", "teamtailor-mail.com", "welcometothejungle.com", "wttj.co", "recruitee.com", "workable.com", "workablemail.com", "jobvite.com", "icims.com", "successfactors.com", "taleo.net", "personio.de", "personio.com", "bamboohr.com", "breezy.hr", "jazzhr.com", "pinpointhq.com", "join.com", "homerun.co", "softgarden.de", "flatchr.io", "talent-soft.com", "linkedin.com", "indeed.com", "indeedemail.com"]

const FREE_MAIL = new Set(["gmail.com", "googlemail.com", "outlook.com", "hotmail.com", "live.com", "yahoo.com", "icloud.com", "me.com", "proton.me", "protonmail.com", "gmx.com", "gmx.de", "web.de", "orange.fr", "wanadoo.fr", "outlook.fr", "hotmail.fr", "yahoo.fr", "live.fr", "free.fr", "laposte.net", "aol.com"])
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

/** Short, stable tag for an application's reply address: "nrv-" + the first 10 hex digits of its id. */
export const replyTag = (applicationId: string) => `nrv-${applicationId.replace(/-/g, "").slice(0, 10).toLowerCase()}`

/** The tag in an address like you+nrv-1a2b3c4d5e@gmail.com or nrv-1a2b3c4d5e@your.domain. */
export function tagIn(address: string): string | null {
  return address.toLowerCase().match(/(?:^|[+.])(nrv-[a-f0-9]{10})@/)?.[1] ?? null
}

/** The reply address for an application, or null when the feature is off. */
export function replyAddress(applicationId: string, mailbox: string, setting: { mode: "off" | "plus" | "domain"; domain?: string }): string | null {
  const tag = replyTag(applicationId)
  if (setting.mode === "plus") {
    const [local, domain] = mailbox.split("@")
    return local && domain ? `${local.split("+")[0]}+${tag}@${domain}` : null
  }
  if (setting.mode === "domain" && setting.domain) return `${tag}@${setting.domain}`
  return null
}

/** Coverage rather than Jaccard: a subject can contain greeting/company words around the full role. */
function roleCoverage(text: string, title: string): number {
  const role = new Set(titleWords(title))
  if (role.size < 2) return 0
  const words = new Set(titleWords(text))
  return [...role].filter((word) => words.has(word)).length / role.size
}

const companyWords = (text: string) => titleWords(text).filter((word) => !["sas", "sa", "inc", "ltd", "llc", "gmbh", "group", "groupe"].includes(word))

/** Bounded typo tolerance on whole names, never substring matching or fuzzy short names. */
function nearName(left: string, right: string): boolean {
  if (left.length < 5 || right.length < 5) return false
  const limit = Math.min(left.length, right.length) >= 9 ? 2 : 1
  if (Math.abs(left.length - right.length) > limit) return false
  let row = Array.from({ length: right.length + 1 }, (_, index) => index)
  for (let i = 1; i <= left.length; i++) {
    const next = [i]
    for (let j = 1; j <= right.length; j++) next[j] = Math.min(next[j - 1] + 1, row[j] + 1, row[j - 1] + Number(left[i - 1] !== right[j - 1]))
    row = next
  }
  return row[right.length] <= limit
}

function nearCompany(text: string, company: string): boolean {
  const name = companyWords(company).join("")
  const count = companyWords(company).length
  if (!count || name.length < 5) return false
  const words = titleWords(text)
  return words.some((_, index) => nearName(words.slice(index, index + count).join(""), name))
}

const NEWSLETTER_HOSTS = ["substack.com", "beehiiv.com", "mailchimp.com", "mailchimpapp.net", "convertkit.com", "kit.com", "ghost.io", "medium.com", "buttondown.email", "buttondown.com", "sendfox.com", "revue.email", "mailerlite.com", "sendinblue.com", "brevo.com", "hubspotemail.net", "campaign-archive.com"]
const ALERT_MAILBOX = /^(?:job-?alerts?|jobs?-?(?:alerts?|digest|recommendations?|listings?)|alerts?|newsletters?|digest|marketing)(?:[-+._]|$)/i
const ALERT_SUBJECT = /\bjob alerts?\b|alertes? emploi|\bis hiring\b|\brecrute\b|may be a fit|new jobs?\b|jobs? (?:for|matching|you may)|nouvelles? offres?|offres? (?:pour|qui) vous|stellenangebote|jobs? recommend/i
const APPLICATION_SUBJECT = /\bapplication\b|\bapplied\b|candidature|postul|bewerbung|solicitud|candidatura|\binterview\b|entretien|\boffer\b/i

/**
 * Mail written to many people at once: a job-alert digest, a newsletter, a
 * marketing send. It can name a company you applied to, even your exact role
 * (an alert lists it, a sponsor advertises it), without being about your
 * application: it is never matched by its content. A confirmation an ATS sends
 * through a list ("Thank you for applying") still says so up front, and stays.
 */
export function isBroadcast(message: MatchMessage): boolean {
  const [mailbox = "", host = ""] = message.fromAddress.trim().toLowerCase().split("@")
  const domain = baseDomain(host)
  if (NEWSLETTER_HOSTS.includes(domain)) return true
  const aboutApplication = APPLICATION_SUBJECT.test(message.subject) || ["acknowledgement", "rejection", "offer"].includes(ruleKind(message.subject, message.text.slice(0, 1200)))
  if (aboutApplication) return false
  if (message.bulk || ALERT_MAILBOX.test(mailbox)) return true
  if (ALERT_SUBJECT.test(message.subject) && ALERT_SENDERS.some((sender) => domain === baseDomain(sender))) return true
  // Several different postings in one email: a digest, whoever sends it.
  const postings = new Set<string>()
  for (const link of message.text.slice(0, 60_000).matchAll(/https?:\/\/[^\s<>()"']+/g)) {
    const job = canonicalJobUrl(link[0])
    if (job && postings.add(job.url).size >= 3) return true
  }
  return false
}

export function matchMessage(message: MatchMessage, candidates: MatchCandidate[]): Match | null {
  const tags = new Set((message.toAddresses ?? []).map(tagIn).filter(Boolean))
  if (tags.size) {
    const tagged = candidates.filter((candidate) => tags.has(replyTag(candidate.applicationId)))
    if (tagged.length === 1) return { applicationId: tagged[0].applicationId, reason: "Sent to this application’s reply address", confidence: 1 }
    if (tagged.length > 1) return null
  }
  const threadIds = new Set([message.inReplyTo, ...(message.references ?? [])].filter(Boolean) as string[])
  const replied = candidates.filter((candidate) => candidate.sentMessageIds.some((id) => threadIds.has(id)))
  if (replied.length === 1) return { applicationId: replied[0].applicationId, reason: "Reply in this application’s email thread", confidence: 1 }
  if (replied.length > 1) return null
  // Past this point the match rests on what the email says: a digest or newsletter says many things.
  if (isBroadcast(message)) return null

  const from = domainOf(message.fromAddress)
  const head = `${message.fromName} ${message.subject}`
  const body = message.text.slice(0, 8000)
  const hiring = ruleKind(message.subject, body) !== "other"
  const senderBrand = FREE_MAIL.has(from) || isAts(from) ? "" : from.split(".")[0]
  const bodyDomains = new Set([...body.matchAll(/(?:https?:\/\/|@)([a-z0-9.-]+\.[a-z]{2,})/gi)].map((match) => baseDomain(match[1])))
  const scored: (Match & { title: number; company: string; active: boolean; updatedAt: number })[] = []
  for (const candidate of candidates) {
    const site = hostOf(candidate.website)
    const title = Math.max(roleCoverage(message.subject, candidate.title), roleCoverage(body, candidate.title))
    const headName = mentions(head, candidate.company)
    const bodyName = mentions(body, candidate.company)
    const contact = candidate.contactEmails?.some((email) => email.trim().toLowerCase() === message.fromAddress.trim().toLowerCase())
    const reasons: string[] = []
    let confidence = 0
    if (contact) {
      confidence = 0.9
      reasons.push("Sender is a linked recruiter or contact")
    }
    if (hiring && title >= 0.65 && candidate.contactNames?.some((name) => titleWords(name).length >= 2 && normalize(name.trim()) === normalize(message.fromName.trim()))) {
      confidence = Math.max(confidence, 0.7)
      reasons.push("Sender name matches a linked recruiter or contact")
    }
    if (site && from === site && !FREE_MAIL.has(from) && !isAts(from)) {
      confidence = Math.max(confidence, 0.9)
      reasons.push(`Sender domain ${site}`)
    }
    if (headName) {
      confidence = Math.max(confidence, 0.8)
      reasons.push(`${candidate.company} in the subject or sender name`)
    } else if (bodyName && (hiring || title >= 0.65 || isAts(from))) {
      confidence = Math.max(confidence, isAts(from) ? 0.8 : 0.65)
      reasons.push(`${candidate.company} in the email body`)
    }
    const brand = companyWords(candidate.company).join("")
    if (senderBrand && brand.length >= 3 && normalize(senderBrand) === brand && (hiring || title >= 0.65)) {
      confidence = Math.max(confidence, 0.8)
      reasons.push("Sender domain names the company")
    }
    // Approximate names require both a strong role match and application-related wording.
    if (!confidence && hiring && title >= 0.65 && (nearCompany(head, candidate.company) || nearCompany(body, candidate.company) || (senderBrand && nearName(normalize(senderBrand), brand)))) {
      confidence = 0.65
      reasons.push(`Similar company name to ${candidate.company}`)
    }
    // A website/email address in the body is corroboration, never sufficient by itself.
    if (site && !FREE_MAIL.has(site) && !isAts(site) && (headName || bodyName || contact || title >= 0.65) && hiring) {
      if (bodyDomains.has(site)) {
        confidence = Math.max(confidence, 0.75)
        reasons.push(`Company domain ${site} in the body`)
      }
    }
    if (!confidence) continue
    if (title >= 0.65) {
      confidence += 0.08 * title
      reasons.push("Matching role title")
    }
    if (hiring) {
      confidence += 0.04
      reasons.push("Application-related wording")
    }
    scored.push({ applicationId: candidate.applicationId, reason: reasons.join("; "), confidence: Math.min(confidence, 0.98), title, company: normalize(candidate.company), active: candidate.active, updatedAt: candidate.updatedAt })
  }
  if (!scored.length) return null
  scored.sort((a, b) => b.confidence - a.confidence || b.title - a.title || Number(b.active) - Number(a.active) || b.updatedAt - a.updatedAt)
  const best = scored[0]
  // Recency must not decide between different companies with similarly strong evidence.
  if (scored.some((item) => item.company !== best.company && best.confidence - item.confidence < 0.12)) return null
  const unsure = scored.some((item) => item.applicationId !== best.applicationId && item.company === best.company && best.confidence - item.confidence < 0.12) && best.title < 0.5
  return { applicationId: best.applicationId, reason: unsure ? `${best.reason} (several roles there; check it’s this one)` : best.reason, confidence: unsure ? best.confidence - 0.2 : best.confidence }
}
