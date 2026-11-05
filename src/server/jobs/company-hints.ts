/**
 * Company hints that generic parsers miss, and a verified website guess for
 * when the posting never links the company's site (LinkedIn, Indeed...).
 */

const decode = (value: string) => value.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'")

/** LinkedIn guest job HTML: the hiring company's LinkedIn page and its square logo. */
export function linkedInTopcard(html: string): { companyPage: string; logo: string } {
  const companyPage = html.match(/class="topcard__org-name-link[^"]*"[^>]*href="([^"]+)"/)?.[1] ?? html.match(/href="([^"]*linkedin\.com\/company\/[^"?]+)[^"]*"[^>]*data-tracking-control-name="public_jobs_topcard_logo"/)?.[1] ?? ""
  const logo = html.match(/data-tracking-control-name="public_jobs_topcard_logo"[\s\S]{0,600}?data-delayed-url="([^"]+company-logo[^"]+)"/)?.[1] ?? ""
  return { companyPage: companyPage ? decode(companyPage).split("?")[0] : "", logo: logo ? decode(logo) : "" }
}

const LEGAL = new Set("sa sas sasu sarl gmbh ag inc llc ltd limited plc bv nv spa srl co corp corporation company group groupe holding the et and de des la le les".split(" "))
const COUNTRY_TLD: [RegExp, string][] = [
  [/france|paris|lyon|lille|marseille|toulouse|nantes|bordeaux|île-de-france/i, "fr"],
  [/germany|deutschland|berlin|munich|münchen|hamburg/i, "de"],
  [/spain|españa|madrid|barcelona/i, "es"],
  [/united kingdom|london|\buk\b|england/i, "co.uk"],
  [/belgium|belgique|brussels|bruxelles/i, "be"],
  [/switzerland|suisse|zürich|zurich|geneva|genève/i, "ch"],
  [/netherlands|amsterdam/i, "nl"],
  [/italy|italia|milan|rome/i, "it"],
  [/morocco|maroc|casablanca|rabat/i, "ma"],
]

const fold = (value: string) => value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
export const nameTokens = (company: string) => fold(company).split(/[^a-z0-9]+/).filter((token) => token.length >= 2 && !LEGAL.has(token))

/** Candidate domains, most specific first. */
export function domainCandidates(company: string, location = ""): string[] {
  const tokens = nameTokens(company)
  if (!tokens.length) return []
  const stems = [...new Set([tokens.join(""), tokens.join("-"), tokens.length > 2 ? tokens.slice(0, 2).join("") : "", tokens.length > 1 ? tokens[0] + tokens.slice(1).map((t) => t[0]).join("") : "", tokens.length > 1 ? `${tokens[0]}-${tokens.slice(1).map((t) => t[0]).join("")}` : "", tokens.map((t) => t[0]).join(""), tokens[0]])].filter((stem) => stem.length >= 3)
  const local = COUNTRY_TLD.find(([pattern]) => pattern.test(location))?.[1]
  const tlds = [...new Set(["com", ...(local ? [local] : []), "io", "eu", "ai", "co"])]
  return stems.flatMap((stem) => tlds.map((tld) => `https://${stem}.${tld}`)).slice(0, 30)
}

/**
 * The page names this company: its title, site name, logo alt, or copyright
 * line contains the full company name, or every distinctive token of it.
 */
export function pageNamesCompany(html: string, company: string): boolean {
  const head = fold([
    html.match(/<title[^>]*>([\s\S]{0,300}?)<\/title>/i)?.[1] ?? "",
    ...[...html.matchAll(/<meta[^>]+(?:property|name)=["'](?:og:site_name|og:title|application-name|twitter:title)["'][^>]+content=["']([^"']{0,200})/gi)].map((match) => match[1]),
    ...[...html.matchAll(/(?:©|&copy;|copyright)\s*(?:\d{4}\s*[-–]?\s*)?(?:\d{4}\s*)?([^<|.]{2,80})/gi)].map((match) => match[1]),
    ...[...html.matchAll(/<img[^>]+alt=["']([^"']{2,80})["'][^>]*>/gi)].slice(0, 8).map((match) => match[1]),
  ].join(" | "))
  const full = fold(company).replace(/[^a-z0-9]+/g, " ").trim()
  if (full && head.replace(/[^a-z0-9]+/g, " ").includes(full)) return true
  const tokens = nameTokens(company)
  return tokens.length >= 2 && tokens.every((token) => new RegExp(`\\b${token}\\b`).test(head))
}

/** Tries likely domains in parallel; accepts the first whose homepage names the company. */
export async function guessCompanySite(company: string, location: string, fetchHtml: (url: string) => Promise<{ html: string; finalUrl: string } | null>): Promise<string> {
  const candidates = domainCandidates(company, location)
  for (let offset = 0; offset < candidates.length; offset += 6) {
    const batch = candidates.slice(offset, offset + 6)
    const results = await Promise.all(batch.map(async (url) => {
      const page = await fetchHtml(url).catch(() => null)
      return page && pageNamesCompany(page.html, company) ? new URL(page.finalUrl || url).origin : ""
    }))
    const hit = results.find(Boolean)
    if (hit) return hit
  }
  return ""
}
