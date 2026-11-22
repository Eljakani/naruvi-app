import "server-only"
import { companyFactsEnabled, getJson } from "@/server/companies/profile"
import type { Lookup, LookupResult } from "./judge"

/**
 * Public encyclopedia lookups for the fit judge: a school, company, certification
 * or technology the requirement or a fact names. Only that name is sent, never
 * the profile. Off when public sources are turned off in Settings (the same
 * switch as company and CV enrichment lookups).
 */
export async function publicLookup(): Promise<Lookup | undefined> {
  return (await companyFactsEnabled().catch(() => true)) ? lookup : undefined
}

async function lookup(name: string, language: string): Promise<LookupResult | null> {
  const base = `https://${language === "fr" ? "fr" : "en"}.wikipedia.org`
  const search = (await getJson(`${base}/w/api.php?action=query&list=search&format=json&srlimit=1&srsearch=${encodeURIComponent(name)}`)) as { query?: { search?: { title: string }[] } }
  const title = search.query?.search?.[0]?.title
  if (!title) return null
  const page = (await getJson(`${base}/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, "_"))}`)) as { title?: string; type?: string; description?: string; extract?: string; content_urls?: { desktop?: { page?: string } } }
  if (!page.title || page.type === "disambiguation" || !page.extract) return null
  return {
    title: page.title,
    summary: [page.description, page.extract].filter(Boolean).join(". ").slice(0, 700),
    url: page.content_urls?.desktop?.page ?? `${base}/wiki/${encodeURIComponent(page.title.replace(/ /g, "_"))}`,
  }
}
