import "server-only"
import { companyFactsEnabled, entities, getJson, label, lookupOrganization, values, type Entity } from "@/server/companies/profile"
import { companyBrandingFromLink } from "@/server/jobs/ingest"
import { eventEdition, genericSkillGroup, nameKey, nameVariants, skillKey, type EnrichmentFact, type EnrichmentSuggestion, type SkillCategory } from "@/lib/enrichment"

/**
 * Looks up what an entry names (its organisation, certification or event,
 * and its skills) in open sources: Wikidata, the French business registry,
 * and the organisation's own website for its logo. Only names are sent. A
 * result is offered only on a clear match, always with its source, and it
 * describes the organisation, certification or event, never the person.
 */

export type EnrichmentRequest = { kind: string; text: Record<string, string>; fields: Record<string, unknown>; skills: string[] }

const empty = (): EnrichmentSuggestion => ({ about: null, logoPath: null, officialName: null, fill: [], skills: [], groups: [] })
const text = (value: unknown) => (typeof value === "string" ? value.trim() : "")
const wikidataUrl = (entity: Entity) => `https://www.wikidata.org/wiki/${entity.id}`

type Hit = { id: string; label: string; description: string; matched: string }
/** Search hits with the text that matched (a label or an alias). One request. */
async function hits(query: string, language = "en"): Promise<Hit[]> {
  const data = (await getJson(`https://www.wikidata.org/w/api.php?action=wbsearchentities&format=json&type=item&limit=6&language=${language}&uselang=${language}&search=${encodeURIComponent(query)}`)) as { search?: { id: string; label?: string; description?: string; match?: { text?: string } }[] }
  return (data.search ?? []).map((item) => ({ id: item.id, label: item.label ?? "", description: item.description ?? "", matched: item.match?.text ?? item.label ?? "" }))
}
/** The first hit that passes `accept`, with its claims. Two requests at most. */
async function find(query: string, accept: (hit: Hit) => boolean): Promise<Entity | null> {
  const hit = (await hits(query)).find(accept)
  return hit ? (await entities([hit.id]))[hit.id] ?? null : null
}
const ids = (entity: Entity, property: string) => values(entity, property).map((value) => (value as { id?: string }).id).filter((id): id is string => Boolean(id))
const year = (entity: Entity, property: string) => (values(entity, property)[0] as { time?: string } | undefined)?.time?.match(/^\+?(\d{4})-(\d{2})/)
const site = (entity: Entity) => values(entity, "P856").map(String).find((url) => /^https?:\/\//.test(url)) ?? null
const describe = (entity: Entity) => entity.descriptions?.en?.value ?? entity.descriptions?.fr?.value ?? null
async function labelsOf(list: string[]): Promise<string> {
  if (!list.length) return ""
  const found = await entities(list.slice(0, 4)).catch(() => ({}) as Record<string, Entity>)
  return list.map((id) => label(found[id])).filter(Boolean).slice(0, 2).join(", ")
}

/* ------------------------------------------------------------------ organisation */

const cache = new Map<string, Promise<unknown>>()
/** Lookups that got no answer during the current request (a source down or refusing). */
let failures = 0
const once = <T,>(key: string, load: () => Promise<T>): Promise<T> => {
  if (!cache.has(key)) {
    if (cache.size > 500) cache.clear()
    // A failed lookup is not remembered: the next import tries again.
    cache.set(key, load().catch(() => {
      cache.delete(key)
      failures += 1
      return null
    }))
  }
  return cache.get(key) as Promise<T>
}

const FACT_LABELS: Record<string, EnrichmentFact["label"]> = { Employees: "employees", "Staff (France)": "employees", Size: "size", Founded: "founded", Registered: "founded", Headquarters: "headquarters", "Head office": "headquarters", Industry: "industry", Parent: "parent" }

async function organization(name: string, field: string): Promise<EnrichmentSuggestion> {
  const out = empty()
  if (name.length < 2) return out
  const profile = await once(`org:${nameKey(name)}`, () => lookupOrganization(name))
  if (!profile) return out
  const seen = new Set<string>()
  // A French registry record found by name alone may be a subsidiary: it speaks only when Wikidata has nothing.
  const wikidata = profile.facts.some((fact) => fact.source === "wikidata")
  const facts = profile.facts.filter((fact) => !wikidata || fact.source === "wikidata").map((fact) => ({ label: FACT_LABELS[fact.label], value: fact.value })).filter((fact): fact is EnrichmentFact => Boolean(fact.label) && !seen.has(fact.label) && (seen.add(fact.label), true))
  out.about = { subject: "organization", query: name, name: profile.name, description: profile.description && !/wiki[mp]edia/i.test(profile.description) ? profile.description : null, website: profile.website, facts, sources: wikidata ? profile.sources.filter((source) => source.name === "Wikidata") : profile.sources, fetchedAt: profile.fetchedAt }
  if (nameKey(profile.name) === nameKey(name) && profile.name !== name) out.officialName = { field, value: profile.name }
  if (profile.website) out.logoPath = (await once(`logo:${profile.website}`, () => companyBrandingFromLink(profile.website!)))?.logo?.path ?? null
  return out
}

/* ------------------------------------------------------------------ certification */

const CERT_WORDS = /certif|credential|qualification|exam|diploma|licen[cs]e|accreditation|professional designation/i

async function certification(name: string, issuer: string): Promise<EnrichmentSuggestion> {
  const base = issuer ? await organization(issuer, "issuer") : empty()
  const variants = nameVariants(name)
  const found = await once(`cert:${nameKey(name)}`, async () => {
    for (const variant of variants) {
      // A short name or an acronym ("PMP") must also be described as a certification.
      const match = await find(variant, (hit) => [hit.label, hit.matched].some((item) => variants.some((wanted) => nameKey(item) === nameKey(wanted))) && (variant.length >= 16 || CERT_WORDS.test(hit.description)))
      if (match) return match
    }
    return null
  })
  if (!found) return base
  const official = label(found) ?? name
  const by = await labelsOf([...ids(found, "P1027"), ...ids(found, "P178"), ...ids(found, "P127"), ...ids(found, "P137")])
  const facts: EnrichmentFact[] = by ? [{ label: "issuer", value: by }] : []
  const out = { ...base }
  // The certification's own record leads; the issuer's stays as the logo and website.
  out.about = { subject: "certification", query: name, name: official, description: describe(found), website: site(found) ?? base.about?.website ?? null, facts, sources: [{ name: "Wikidata", url: wikidataUrl(found) }, ...(base.about?.sources ?? [])].slice(0, 3), fetchedAt: new Date().toISOString() }
  out.officialName = official !== name && variants.some((variant) => nameKey(variant) === nameKey(official)) ? { field: "name", value: official } : null
  if (!issuer && by) {
    out.fill = [{ field: "issuer", value: by.split(", ")[0] }]
    out.logoPath = (await organization(by.split(", ")[0], "issuer")).logoPath
  }
  return out
}

/* ------------------------------------------------------------------ event */

const EVENT_WORDS = /conference|festival|summit|event|meetup|hackathon|convention|symposium|workshop|congress|fair|exhibition|conf[ée]rence|salon|kongress|messe|congreso|jornadas|edition/i

async function event(name: string, has: { organizer: string; location: string; date: string }): Promise<EnrichmentSuggestion> {
  const out = empty()
  const { series, year: edition } = eventEdition(name)
  if (series.length < 3) return out
  const found = await once(`event:${nameKey(name)}`, async () => {
    for (const query of [...new Set([name, series])]) {
      const match = await find(query, (hit) => [hit.label, hit.matched].some((item) => nameKey(item) === nameKey(query)) && EVENT_WORDS.test(hit.description))
      if (match) return { entity: match, exact: query === name }
    }
    return null
  })
  if (!found) return out
  const { entity, exact } = found
  const official = label(entity) ?? name
  // Only an edition's own record gives a date and a place; a series runs in a different city each year.
  const isEdition = exact && Boolean(edition) && /(?:19|20)\d{2}/.test(official)
  const organizer = await labelsOf(ids(entity, "P664"))
  const place = isEdition ? await labelsOf(ids(entity, "P276")) : ""
  const country = isEdition ? await labelsOf(ids(entity, "P17")) : ""
  const when = isEdition ? year(entity, "P580") ?? year(entity, "P585") : null
  const date = when ? (when[2] === "00" ? when[1] : `${when[1]}-${when[2]}`) : ""
  const facts: EnrichmentFact[] = []
  if (organizer) facts.push({ label: "organizer", value: organizer })
  if (place) facts.push({ label: "place", value: place })
  else if (country) facts.push({ label: "country", value: country })
  if (date) facts.push({ label: "date", value: date })
  const website = site(entity)
  out.about = { subject: "event", query: name, name: official, description: describe(entity), website, facts, sources: [{ name: "Wikidata", url: wikidataUrl(entity) }], fetchedAt: new Date().toISOString() }
  if (isEdition && official !== name && nameKey(official) === nameKey(name)) out.officialName = { field: "event", value: official }
  if (organizer && !has.organizer) out.fill.push({ field: "organizer", value: organizer.split(", ")[0] })
  if (place && !has.location) out.fill.push({ field: "location", value: place.split(", ")[0] })
  if (date && !has.date && (!edition || date.startsWith(edition))) out.fill.push({ field: "date", value: date })
  if (website) out.logoPath = (await once(`logo:${website}`, () => companyBrandingFromLink(website)))?.logo?.path ?? null
  return out
}

/* ------------------------------------------------------------------ skills */

/** How Wikidata describes a technology, and the family each wording stands for. Anything else is not renamed. */
const SKILL_FAMILIES: [RegExp, SkillCategory][] = [
  [/programming language|markup language|query language|scripting language|style ?sheet language|superset of javascript|computer language|modeling language/i, "language"],
  [/database|dbms|data store|data warehouse|search engine software|message broker|stream[- ]processing/i, "database"],
  [/framework|library|toolkit|runtime|engine for|sdk\b/i, "framework"],
  [/operating system|cloud computing|cloud platform|web services|container|virtuali[sz]ation|kernel/i, "platform"],
  [/software|application|\btool\b|editor|version control|revision control|protocol|file format|spreadsheet|\bide\b|web service|issue track|infrastructure as code|workflow|numerical computing/i, "tool"],
]

type WikiPage = { title: string; description?: string; pageprops?: { wikibase_item?: string; disambiguation?: string }; missing?: boolean }
/** Wikipedia pages for up to 50 titles in one request, redirects followed ("K8s" → Kubernetes). Keyed by the title asked for. */
async function wikipediaPages(titles: string[]): Promise<Map<string, WikiPage>> {
  const out = new Map<string, WikiPage>()
  if (!titles.length) return out
  const data = (await getJson(`https://en.wikipedia.org/w/api.php?action=query&format=json&formatversion=2&redirects=1&prop=pageprops%7Cdescription&ppprop=wikibase_item%7Cdisambiguation&titles=${encodeURIComponent(titles.slice(0, 50).join("|"))}`)) as { query?: { normalized?: { from: string; to: string }[]; redirects?: { from: string; to: string }[]; pages?: WikiPage[] } }
  const step = (list: { from: string; to: string }[] | undefined, title: string) => list?.find((item) => item.from === title)?.to ?? title
  for (const title of titles) {
    const final = step(data.query?.redirects, step(data.query?.normalized, title))
    const page = data.query?.pages?.find((item) => item.title === final)
    if (page && !page.missing) out.set(title, page)
  }
  return out
}

type SkillMatch = { to: string; category: SkillCategory; source: string }
const skillMatches = new Map<string, SkillMatch | null>()

/**
 * The usual name and family of each skill that is a technology, from
 * Wikipedia: the page a skill's name leads to (redirects make "k8s"
 * Kubernetes and "Postgres" PostgreSQL), kept only when its description
 * says it is a language, a framework, a database, a platform or a tool.
 * Three requests at most for the whole list.
 */
async function skillNames(list: string[]): Promise<Map<string, SkillMatch>> {
  const pending = [...new Set(list)].filter((name) => !skillMatches.has(skillKey(name)) && name.length <= 40 && !/[|#<>[\]{}]/.test(name))
  const settle = (name: string, page: WikiPage | undefined): boolean => {
    if (!page || page.pageprops?.disambiguation !== undefined) return false
    const category = SKILL_FAMILIES.find(([pattern]) => pattern.test(page.description ?? ""))?.[1]
    if (!category) return false
    const to = page.title.replace(/\s*\([^)]*\)$/, "")
    skillMatches.set(skillKey(name), { to, category, source: `https://en.wikipedia.org/wiki/${encodeURIComponent(page.title.replace(/ /g, "_"))}` })
    return true
  }
  // As written first, then the titles Wikipedia uses when a name is shared ("Go (programming language)").
  let open = pending
  for (const suffix of ["", " (programming language)", " (software)"]) {
    if (!open.length) break
    const pages = await wikipediaPages(open.map((name) => `${name}${suffix}`))
    open = open.filter((name) => !settle(name, pages.get(`${name}${suffix}`)))
  }
  for (const name of open) skillMatches.set(skillKey(name), null)
  if (skillMatches.size > 3000) skillMatches.clear()
  return new Map(list.flatMap((name) => ((match) => (match ? [[name, match] as const] : []))(skillMatches.get(skillKey(name)))))
}

async function skills(entry: EnrichmentRequest): Promise<EnrichmentSuggestion> {
  const out = empty()
  const list = entry.skills.slice(0, 50)
  const found = await skillNames(list).catch(() => {
    failures += 1
    return new Map<string, SkillMatch>()
  })
  for (const [from, match] of found) {
    // A different spelling, not a different thing: "reactjs" → "React", "k8s" → "Kubernetes".
    if (match.to !== from && !list.some((other) => other !== from && skillKey(other) === skillKey(match.to))) out.skills.push({ from, ...match })
  }
  const families = [...new Set([...found.values()].map((match) => match.category))]
  if (genericSkillGroup(Object.values(entry.text)[0] ?? "") && found.size >= 4 && families.length >= 2) {
    out.groups = families.map((family) => ({ category: family, skills: list.filter((item) => found.get(item)?.category === family) }))
    const rest = list.filter((item) => !found.has(item))
    if (rest.length) out.groups.push({ category: "other", skills: rest })
  }
  return out
}

/* ------------------------------------------------------------------ all entries */

async function pooled<T, R>(items: T[], size: number, run: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length)
  let next = 0
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, async () => {
    while (next < items.length) {
      const index = next
      next += 1
      results[index] = await run(items[index], index)
    }
  }))
  return results
}

/** One suggestion per entry, in order; `null` where nothing clear was found. Never throws. */
export async function enrichEntries(entries: EnrichmentRequest[]): Promise<{ enabled: boolean; failed: number; suggestions: (EnrichmentSuggestion | null)[] }> {
  if (!(await companyFactsEnabled().catch(() => true))) return { enabled: false, failed: 0, suggestions: entries.map(() => null) }
  failures = 0
  const suggestions = await pooled(entries.slice(0, 120), 4, async (entry) => {
    try {
      const result =
        entry.kind === "experience" ? await organization(text(entry.fields.company), "company")
        : entry.kind === "education" ? await organization(text(entry.fields.school), "school")
        : entry.kind === "certification" ? await certification(text(entry.fields.name), text(entry.fields.issuer))
        : entry.kind === "event" ? await event(text(entry.fields.event) || text(entry.text.title), { organizer: text(entry.fields.organizer), location: text(entry.text.location), date: text(entry.fields.date) })
        : entry.kind === "skill" ? await skills(entry)
        : empty()
      return result.about || result.skills.length || result.groups.length || result.fill.length ? result : null
    } catch {
      return null
    }
  })
  return { enabled: true, failed: failures, suggestions }
}
