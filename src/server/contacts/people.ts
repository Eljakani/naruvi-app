import "server-only"
import { eq, inArray } from "drizzle-orm"
import { PEOPLE_ACTOR, linkedinCompany, peopleInput, personFrom, type CompanyPerson } from "@/lib/company-people"
import { db } from "@/server/db/client"
import { companies, contacts } from "@/server/db/schema"
import { apifyToken } from "@/server/jobs/discover"
import { SettingsError } from "@/server/settings/errors"

/**
 * People who work at a company, from public LinkedIn profiles (Apify, your own
 * token). Nothing is saved: you pick who becomes a contact. The people
 * database often doesn't know a company by its website; `unknownCompany`
 * then asks for its LinkedIn page, which it does know.
 */
export async function findCompanyPeople(companyId: string, titles: string[], linkedinPage = "", fetcher: typeof fetch = fetch): Promise<{ people: (CompanyPerson & { saved: boolean })[]; unknownCompany: boolean; broadened: boolean }> {
  const [company] = await db.select({ website: companies.website }).from(companies).where(eq(companies.id, companyId))
  if (!company) throw new SettingsError("Company not found.")
  const page = linkedinCompany(linkedinPage)
  if (linkedinPage.trim() && !page) throw new SettingsError("Use a LinkedIn company page link (linkedin.com/company/…).")
  if (!page && !company.website) throw new SettingsError("Add the company website or its LinkedIn page first, so the search knows which company this is.")
  const token = await apifyToken()
  const search = async (filter: string[]) => {
    const response = await fetcher(`https://api.apify.com/v2/acts/${PEOPLE_ACTOR}/run-sync-get-dataset-items?clean=true`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(peopleInput(page ?? company.website!, filter)),
      signal: AbortSignal.timeout(240_000),
    })
    if (response.status === 401) throw new SettingsError("Apify didn’t accept your token. Paste a new one on the Integrations page.")
    if (!response.ok) throw new Error(`Apify (${response.status}): ${(await response.text()).slice(0, 200)}`)
    const items: unknown = await response.json()
    const rows = Array.isArray(items) ? items : []
    // The actor reports its own failures as rows (a used-up free tier, a bad input): say so instead of "nobody found".
    const failure = rows.find((row) => row && typeof row === "object" && (row as { status?: unknown }).status === "error") as { reason?: unknown } | undefined
    if (failure) throw new SettingsError(`Apify: ${String(failure.reason ?? "the people search failed.").split(/(?<=\.)\s/)[0]}`)
    return [...new Map(rows.flatMap((item) => (item && typeof item === "object" ? (personFrom(item as Record<string, unknown>) ?? []) : [])).map((person) => [person.linkedinUrl, person])).values()]
  }
  let people = await search(titles)
  // A small company may have nobody with those titles: then show who works there (its founders, usually).
  let broadened = false
  if (!people.length && titles.length) {
    people = await search([])
    broadened = people.length > 0
  }
  const known = people.length ? await db.select({ url: contacts.linkedinUrl }).from(contacts).where(inArray(contacts.linkedinUrl, people.map((person) => person.linkedinUrl))) : []
  const saved = new Set(known.map((row) => row.url))
  return { people: people.map((person) => ({ ...person, saved: saved.has(person.linkedinUrl) })), unknownCompany: !page && !people.length, broadened }
}
