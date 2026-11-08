import { z } from "zod"
import type { CompanyProfile } from "@/server/companies/profile"
import type { PageFacts } from "./extract"

const wikipediaSummary = z.object({
  type: z.literal("standard"), title: z.string().min(1).max(300),
  wikibase_item: z.string().regex(/^Q\d+$/), extract: z.string().trim().min(40).max(12_000),
})

function evidence(url: string, title: string, text: string): PageFacts {
  return { url, title, text, description: "", headings: [], statements: [], values: [], organization: null }
}

/** Only enrich the entity whose official website matched, never a name-only search hit. */
export async function publicResearchSources(profile: CompanyProfile | null, fetcher: typeof fetch = fetch): Promise<{ pages: PageFacts[]; notes: string[] }> {
  const pages: PageFacts[] = []
  const notes: string[] = []
  if (profile?.match !== "website") return { pages, notes }
  const wikidata = profile.sources.find((source) => /^https:\/\/(?:www\.)?wikidata\.org\/wiki\/Q\d+$/.test(source.url))
  if (!wikidata) return { pages, notes }
  const entityId = new URL(wikidata.url).pathname.split("/").at(-1)!
  // French registry records can match by name only; don't merge those into a global company.
  const facts = profile.facts.filter((fact) => fact.source === "wikidata")
  const text = [profile.description, ...facts.map((fact) => `${fact.label}: ${fact.value}`), `Facts retrieved: ${profile.fetchedAt}`].filter(Boolean).join("\n")
  if (profile.description || facts.length) pages.push(evidence(wikidata.url, "Wikidata · Verified company facts", text))

  const article = profile.links.find((link) => link.label === "Wikipedia")
  if (!article) return { pages, notes }
  try {
    const url = new URL(article.url)
    if (url.protocol !== "https:" || url.username || url.password || !/^(?:en|fr)\.wikipedia\.org$/.test(url.hostname) || !url.pathname.startsWith("/wiki/")) return { pages, notes }
    const title = decodeURIComponent(url.pathname.slice("/wiki/".length))
    if (!title || title.includes(":")) return { pages, notes }
    const endpoint = new URL(`/api/rest_v1/page/summary/${encodeURIComponent(title)}`, url.origin)
    const response = await fetcher(endpoint.toString(), {
      headers: { accept: "application/json", "user-agent": "Naruvi/0.1 (self-hosted company research)" },
      signal: AbortSignal.timeout(6000), redirect: "error", cache: "no-store",
    })
    if (!response.ok) throw new Error("Wikipedia unavailable")
    const parsed = wikipediaSummary.safeParse(await response.json())
    if (!parsed.success || parsed.data.wikibase_item !== entityId) {
      notes.push("The Wikipedia article could not be matched to the verified company and was excluded.")
      return { pages, notes }
    }
    pages.push(evidence(article.url, `Wikipedia · ${parsed.data.title}`, parsed.data.extract))
  } catch {
    notes.push("Wikipedia couldn’t be reached. Research uses the other available sources.")
  }
  return { pages, notes }
}
