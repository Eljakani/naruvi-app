/**
 * Grounded CV composer. Pure and deterministic.
 *
 * It never writes new claims: bullets are the user's approved phrasings (or,
 * as a fallback, verified facts) in the target language. It only *selects and
 * orders* them for a job, using the fit analysis.
 */
import { compareRangesDesc, parseDateRange } from "@/lib/dates"
import { keywordsIn } from "@/server/analysis/keywords"
import { sectionTitle, type CvBullet, type CvDocument, type CvItem, type CvSection } from "./model"

export type ComposeEntry = {
  id: string
  kind: string
  status: string
  title: string
  display: Record<string, { role?: string; organization?: string; dates?: string; location?: string; label?: string }>
  skills: string[]
  logoPath: string | null
  sortOrder: number
  facts: { id: string; statement: string }[]
  phrasings: { id: string; group: string; role: "bullet" | "label"; language: string; text: string; factIds: string[]; grounding: { grounded: boolean } }[]
}

export type ComposeAnalysis = {
  requirements: { kind: string; status: string; keywords: string[]; factIds: string[] }[]
  recommendedEntries: { entryId: string; requirements: number }[]
  keywords: { key: string; count: number }[]
}

export type ComposeProfile = {
  fullName: string
  headlines: Record<string, string>
  email: string
  phone: string
  location: string
  links: { label: string; url: string }[]
  photoPath: string | null
  defaultLanguage: string
}

export type ComposeOptions = { language: string; maxExperience?: number; maxProjects?: number; bulletsTop?: number; bulletsOther?: number }

const clean = (text: string) => text.replace(/\*\*(.+?)\*\*/g, "$1").trim()

/** Relevance of a bullet to the job: evidence for a requirement, then shared skills. */
function relevance(bullet: { text: string; factIds: string[] }, analysis: ComposeAnalysis | null) {
  if (!analysis) return 0
  const proven = new Set(analysis.requirements.filter((r) => r.status === "met" || r.status === "partial").flatMap((r) => r.factIds))
  const weights = new Map(analysis.keywords.map((k, i) => [k.key, 1 + (analysis.keywords.length - i) / analysis.keywords.length]))
  const keyScore = keywordsIn(bullet.text).reduce((sum, key) => sum + (weights.get(key) ?? 0), 0)
  const evidence = bullet.factIds.filter((id) => proven.has(id)).length
  return evidence * 3 + keyScore
}

function bulletsFor(entry: ComposeEntry, language: string, defaultLanguage: string, analysis: ComposeAnalysis | null, limit: number): CvBullet[] | null {
  const phrasings = entry.phrasings.filter((p) => p.role === "bullet" && p.language === language && p.grounding.grounded)
  let pool: CvBullet[]
  if (phrasings.length) {
    pool = phrasings.map((p) => ({ id: `p:${p.id}`, text: clean(p.text), source: "phrasing", phrasingId: p.id, factIds: p.factIds, included: true }))
  } else if (language === defaultLanguage && entry.facts.length) {
    // No approved wording yet: verified facts in the profile's own language.
    pool = entry.facts.map((f) => ({ id: `f:${f.id}`, text: clean(f.statement), source: "fact", phrasingId: null, factIds: [f.id], included: true }))
  } else {
    return entry.phrasings.some((p) => p.role === "bullet") || entry.facts.length ? null : []
  }
  const ranked = pool.map((bullet, index) => ({ bullet, index, score: relevance(bullet, analysis) }))
  ranked.sort((a, b) => b.score - a.score || a.index - b.index)
  // Keep the best ones, but over-supply (excluded) so the user can swap them in.
  return ranked.map((item, rank) => ({ ...item.bullet, included: rank < limit }))
}

function itemFor(entry: ComposeEntry, language: string, bullets: CvBullet[]): CvItem {
  const display = entry.display[language] ?? entry.display.en ?? Object.values(entry.display)[0] ?? {}
  return {
    entryId: entry.id,
    title: display.role || display.label || entry.title,
    organization: display.organization ?? "",
    dates: display.dates ?? "",
    location: display.location ?? "",
    logoPath: entry.logoPath,
    included: true,
    bullets,
  }
}

export function composeCv(profile: ComposeProfile, entries: ComposeEntry[], analysis: ComposeAnalysis | null, options: ComposeOptions): CvDocument {
  const { language } = options
  const maxExperience = options.maxExperience ?? 6
  const maxProjects = options.maxProjects ?? 3
  const verified = entries.filter((entry) => entry.status === "verified")
  const rank = new Map((analysis?.recommendedEntries ?? []).map((item, index) => [item.entryId, index]))
  const byRelevance = (a: ComposeEntry, b: ComposeEntry) => (rank.get(a.id) ?? 999) - (rank.get(b.id) ?? 999) || a.sortOrder - b.sortOrder
  const missing: { entryId: string; title: string }[] = []

  const build = (kind: string, sectionKind: CvSection["kind"], limit: number, sortByRelevance: boolean, bulletsTop: number, bulletsOther: number) => {
    // Newest first by the dates the user wrote (any language); undated entries keep their order.
    const dates = (entry: ComposeEntry) => parseDateRange(entry.display[language]?.dates ?? entry.display.en?.dates ?? Object.values(entry.display)[0]?.dates)
    const list = verified.filter((entry) => entry.kind === kind).sort((a, b) => compareRangesDesc(dates(a), dates(b)) || a.sortOrder - b.sortOrder)
    // Relevance decides *which* entries make it; order stays chronological for
    // experience/education and by relevance for projects.
    const keep = new Set([...list].sort(byRelevance).slice(0, limit).map((entry) => entry.id))
    const ordered = (sortByRelevance ? [...list].sort(byRelevance) : list).filter((entry) => keep.has(entry.id))
    const items: CvItem[] = []
    for (const entry of ordered) {
      const top = (rank.get(entry.id) ?? 999) < 3
      const bullets = bulletsFor(entry, language, profile.defaultLanguage, analysis, top ? bulletsTop : bulletsOther)
      if (bullets === null) {
        missing.push({ entryId: entry.id, title: entry.title })
        continue
      }
      items.push(itemFor(entry, language, bullets))
    }
    return items.length ? ({ id: sectionKind, kind: sectionKind, title: sectionTitle(sectionKind, language), included: true, items, groups: [] } satisfies CvSection) : null
  }

  const sections: CvSection[] = []
  const experience = build("experience", "experience", maxExperience, false, options.bulletsTop ?? 4, options.bulletsOther ?? 2)
  if (experience) sections.push(experience)
  const projects = build("project", "project", maxProjects, true, 2, 2)
  if (projects) {
    // Projects only earn space when the job cares about them.
    projects.items = projects.items.filter((item) => rank.has(item.entryId))
    if (projects.items.length) sections.push(projects)
  }
  const education = build("education", "education", 4, false, 1, 1)
  if (education) sections.push(education)
  const certifications = verified.filter((e) => e.kind === "certification")
  if (certifications.length) {
    sections.push({
      id: "certification",
      kind: "certification",
      title: sectionTitle("certification", language),
      included: true,
      items: certifications.map((entry) => ({ ...itemFor(entry, language, []), bullets: [] })),
      groups: [],
    })
  }

  // Skills: skill-cluster entries, ordered by how much the job asks for them.
  const jobKeys = new Set((analysis?.keywords ?? []).map((k) => k.key))
  const skillGroups = verified
    .filter((entry) => entry.kind === "skill" && entry.skills.length)
    .map((entry) => {
      const label = entry.phrasings.find((p) => p.role === "label" && p.language === language)?.text ?? entry.display[language]?.label ?? entry.title
      const values = [...entry.skills].sort((a, b) => Number(keywordsIn(b).some((k) => jobKeys.has(k))) - Number(keywordsIn(a).some((k) => jobKeys.has(k))))
      const score = entry.skills.filter((skill) => keywordsIn(skill).some((k) => jobKeys.has(k))).length
      return { label: clean(label), values: values.map((v) => v.replace(/\s*\(.*\)$/, "")), score }
    })
    .sort((a, b) => b.score - a.score)
  if (skillGroups.length) sections.push({ id: "skills", kind: "skills", title: sectionTitle("skills", language), included: true, items: [], groups: skillGroups.map(({ label, values }) => ({ label, values })) })

  const languageEntry = verified.find((entry) => entry.kind === "language")
  if (languageEntry?.facts.length) {
    sections.push({ id: "languages", kind: "languages", title: sectionTitle("languages", language), included: true, items: [], groups: [{ label: "", values: languageEntry.facts.map((fact) => fact.statement.replace(/\.$/, "")) }] })
  }

  return {
    version: 1,
    language,
    template: "classic",
    header: {
      name: profile.fullName,
      // No fallback to another language: the quality gate asks for one instead.
      headline: profile.headlines[language] ?? "",
      email: profile.email,
      phone: profile.phone,
      location: profile.location,
      links: profile.links,
      photoPath: profile.photoPath,
      showPhoto: false,
    },
    sections,
    missingTranslations: missing,
  }
}
