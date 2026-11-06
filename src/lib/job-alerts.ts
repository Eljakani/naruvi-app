/**
 * Job links inside job-alert emails (LinkedIn, Indeed, Welcome to the Jungle,
 * Glassdoor…). Pure: finds posting links, drops tracking, keeps one per job.
 */
export const ALERT_SENDERS = ["linkedin.com", "indeed.com", "indeedemail.com", "welcometothejungle.com", "wttj.co", "glassdoor.com", "glassdoor.fr", "hellowork.com", "apec.fr", "monster.com", "monster.fr", "stepstone.de", "stepstone.fr", "xing.com", "jobteaser.com", "otta.com", "wellfound.com", "ziprecruiter.com", "seek.com.au", "reed.co.uk", "totaljobs.com", "infojobs.net", "francetravail.fr", "jobup.ch", "jobs.ch"]

export type JobLead = { url: string; title: string; board: string }

const decode = (text: string) =>
  text
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim()

/** A posting URL in canonical form, or null when the link isn't a single job. */
export function canonicalJobUrl(raw: string): { url: string; board: string } | null {
  let url: URL
  try {
    url = new URL(raw.replace(/&amp;/g, "&"))
  } catch {
    return null
  }
  // Redirect wrappers carry the real link in a parameter.
  for (const key of ["url", "u", "dest", "destination", "redirect", "target"]) {
    const inner = url.searchParams.get(key)
    if (inner && /^https?:\/\//.test(inner)) return canonicalJobUrl(inner)
  }
  const host = url.hostname.replace(/^www\./, "").toLowerCase()
  const linkedin = url.pathname.match(/\/(?:comm\/)?jobs\/view\/(?:[^/]*-)?(\d{6,})/)
  if (host.endsWith("linkedin.com") && linkedin) return { url: `https://www.linkedin.com/jobs/view/${linkedin[1]}/`, board: "linkedin" }
  const jk = url.searchParams.get("jk") ?? url.searchParams.get("vjk")
  if (host.includes("indeed.") && jk && /^[a-f0-9]{8,}$/i.test(jk)) return { url: `https://${host.startsWith("fr.") || host.endsWith(".fr") ? "fr.indeed.com" : "www.indeed.com"}/viewjob?jk=${jk}`, board: "indeed" }
  if (host.endsWith("welcometothejungle.com") && /\/companies\/[^/]+\/jobs\/[^/?#]+/.test(url.pathname)) return { url: `https://www.welcometothejungle.com${url.pathname.replace(/\/$/, "")}`, board: "welcometothejungle" }
  if (host.includes("glassdoor.") && /job-listing|partner\/joblisting/i.test(url.pathname)) return { url: `https://${host}${url.pathname}${url.search.includes("jl=") ? `?jl=${url.searchParams.get("jl")}` : ""}`, board: "glassdoor" }
  if (/(^|\.)(greenhouse\.io|lever\.co|ashbyhq\.com|smartrecruiters\.com|myworkdayjobs\.com|workable\.com|teamtailor\.com|recruitee\.com)$/.test(host) && url.pathname.split("/").filter(Boolean).length >= 2) return { url: `https://${url.hostname}${url.pathname.replace(/\/$/, "")}`, board: host.split(".").slice(-2, -1)[0] }
  return null
}

const GENERIC = /^(view( job)?|apply( now)?|see (job|more|details)|voir (l['’]offre|plus)|postuler|more|details|learn more|jetzt bewerben|ver oferta|\d+|)$/i

/** Every distinct job link in an alert email, with the best title its links carry. */
export function extractJobLeads(html: string, text: string): JobLead[] {
  const found = new Map<string, JobLead>()
  for (const match of html.matchAll(/<a\b[^>]*\bhref\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const job = canonicalJobUrl(match[1])
    if (!job) continue
    const title = decode(match[2]).slice(0, 160)
    const current = found.get(job.url)
    const useful = !GENERIC.test(title) && title.length >= 3
    if (!current) found.set(job.url, { ...job, title: useful ? title : "" })
    else if (!current.title && useful) current.title = title
  }
  for (const match of text.matchAll(/https?:\/\/[^\s<>()"']+/g)) {
    const job = canonicalJobUrl(match[0])
    if (job && !found.has(job.url)) found.set(job.url, { ...job, title: "" })
  }
  return [...found.values()].slice(0, 50)
}
