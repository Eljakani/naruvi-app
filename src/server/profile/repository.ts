import "server-only"
import { readdir, readFile } from "node:fs/promises"
import { basename, join } from "node:path"
import { and, asc, eq, inArray, isNull } from "drizzle-orm"
import { imageSize } from "@/server/assets/image"
import { storeLogo, storePhoto } from "@/server/assets/store"
import { db } from "@/server/db/client"
import { entries, facts, phrasings, profiles } from "@/server/db/schema"
import { rankFacts, supportFor, verifySupport } from "@/server/domain/grounding"
import { matchLogo } from "./logo-match"
import { parseIdentity, parsePool } from "./pool-parser"
import { entryInput, identityInput, type EntryInput, type IdentityInput } from "./schemas"

/** Single-user app: the first profile is the profile. */
export async function getProfile() {
  const [profile] = await db.select().from(profiles).orderBy(asc(profiles.createdAt)).limit(1)
  return profile ?? null
}

async function requireProfile() {
  const profile = await getProfile()
  if (profile) return profile
  const [created] = await db.insert(profiles).values({ fullName: "Your name" }).returning()
  return created
}

export async function saveIdentity(input: IdentityInput) {
  const data = identityInput.parse(input)
  const profile = await requireProfile()
  const [saved] = await db.update(profiles).set(data).where(eq(profiles.id, profile.id)).returning()
  return saved
}

/** Entries with facts and phrasings; each phrasing carries its grounding check. */
export async function listEntries() {
  const profile = await getProfile()
  if (!profile) return []
  const rows = await db.select().from(entries).where(eq(entries.profileId, profile.id)).orderBy(asc(entries.kind), asc(entries.sortOrder), asc(entries.title))
  if (!rows.length) return []
  const ids = rows.map((row) => row.id)
  const [factRows, phrasingRows] = await Promise.all([
    db.select().from(facts).where(inArray(facts.entryId, ids)).orderBy(asc(facts.sortOrder)),
    db.select().from(phrasings).where(inArray(phrasings.entryId, ids)).orderBy(asc(phrasings.group), asc(phrasings.sortOrder)),
  ])
  return rows.map((entry) => {
    const entryFacts = factRows.filter((fact) => fact.entryId === entry.id)
    return {
      ...entry,
      facts: entryFacts,
      phrasings: phrasingRows
        .filter((phrasing) => phrasing.entryId === entry.id)
        .map((phrasing) => ({
          ...phrasing,
          grounding:
            phrasing.role === "label"
              ? { factIds: [], unsupportedNumbers: [], grounded: true }
              : verifySupport(phrasing.text, entryFacts.filter((fact) => phrasing.factIds.includes(fact.id))),
        })),
    }
  })
}
export type ProfileEntry = Awaited<ReturnType<typeof listEntries>>[number]

/**
 * Create or replace an entry with its facts and phrasings in one transaction.
 * Phrasings are linked to facts explicitly (factRefs) or by the grounding
 * heuristic, so every approved wording points at the truth behind it.
 */
export async function saveEntry(input: EntryInput, entryId?: string) {
  const data = entryInput.parse(input)
  const profile = await requireProfile()
  return db.transaction(async (tx) => {
    const values = {
      title: data.title,
      kind: data.kind,
      status: data.status,
      display: data.display,
      tags: data.tags,
      skills: data.skills,
      evidence: data.evidence,
      doNotClaim: data.doNotClaim,
      confidential: data.confidential,
      logoPath: data.logoPath,
    }
    const [entry] = entryId
      ? await tx.update(entries).set(values).where(eq(entries.id, entryId)).returning()
      : await tx
          .insert(entries)
          .values({ ...values, profileId: profile.id, key: `${data.kind}-${crypto.randomUUID().slice(0, 8)}` })
          .returning()
    if (!entry) throw new Error("Entry not found.")
    await tx.delete(phrasings).where(eq(phrasings.entryId, entry.id))
    await tx.delete(facts).where(eq(facts.entryId, entry.id))
    const savedFacts = data.facts.length
      ? await tx
          .insert(facts)
          .values(data.facts.map((fact, index) => ({ entryId: entry.id, statement: fact.statement, sortOrder: index })))
          .returning()
      : []
    if (data.phrasings.length) {
      await tx.insert(phrasings).values(
        data.phrasings.map((phrasing, index) => ({
          entryId: entry.id,
          group: phrasing.group,
          role: phrasing.role,
          language: phrasing.language,
          text: phrasing.text,
          sortOrder: index,
          factIds: phrasing.factRefs
            ? phrasing.factRefs.map((ref) => savedFacts[ref]?.id).filter((id): id is string => Boolean(id))
            : supportFor(phrasing.text, savedFacts).factIds,
        })),
      )
    }
    return entry
  })
}

export async function setEntryStatus(entryId: string, status: "verified" | "needs_review" | "archived") {
  await db.update(entries).set({ status }).where(eq(entries.id, entryId))
}

export async function deleteEntry(entryId: string) {
  await db.delete(entries).where(eq(entries.id, entryId))
}

/**
 * Link phrasings to facts. Translations rarely share words with the source
 * facts, so an unlinked phrasing inherits the links of its sibling in another
 * language (same group, same position), then is re-verified on numbers.
 */
function linkPhrasings(items: { group: string; language: string; text: string; role: string }[], entryFacts: { id: string; statement: string }[]) {
  const direct = items.map((item) => (item.role === "label" ? verifySupport(item.text, []) : supportFor(item.text, entryFacts)))
  const position = (index: number) => items.slice(0, index).filter((item) => item.group === items[index].group && item.language === items[index].language).length
  return direct.map((support, index) => {
    const item = items[index]
    if (item.role === "label" || support.factIds.length) return support
    const sibling = items.findIndex((other, j) => j !== index && other.group === item.group && other.language !== item.language && position(j) === position(index) && direct[j].factIds.length)
    if (sibling < 0) return support
    return verifySupport(item.text, entryFacts.filter((fact) => direct[sibling].factIds.includes(fact.id)))
  })
}

/* ------------------------------------------------------------------ */
/* import from a my-cv style profile folder                            */
/* ------------------------------------------------------------------ */

async function markdownFiles(dir: string): Promise<string[]> {
  const out: string[] = []
  for (const item of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, item.name)
    if (item.isDirectory()) out.push(...(await markdownFiles(path)))
    else if (item.name.endsWith(".md")) out.push(path)
  }
  return out.sort()
}

export type ImportSummary = { entries: number; facts: number; phrasings: number; logos: number; ungrounded: { entry: string; text: string; numbers: string[] }[] }

/** Idempotent: entries are upserted by key; their facts and phrasings are replaced. */
export async function importProfileFolder(folder: string): Promise<ImportSummary> {
  const poolsDir = join(folder, "pools")
  const files = await markdownFiles(poolsDir).catch(() => {
    throw new Error(`No pools/ folder found in ${folder}.`)
  })
  const identity = await readFile(join(folder, "identity.md"), "utf8").then(parseIdentity).catch(() => null)
  const parsed = await Promise.all(files.map(async (file) => parsePool(await readFile(file, "utf8"), basename(file, ".md"))))
  const profile = await requireProfile()

  if (identity?.fullName) {
    await db
      .update(profiles)
      .set({ fullName: identity.fullName, email: identity.email, phone: identity.phone, location: identity.location, availability: identity.availability, links: identity.links, locked: identity.locked })
      .where(eq(profiles.id, profile.id))
  }

  const summary: ImportSummary = { entries: 0, facts: 0, phrasings: 0, logos: 0, ungrounded: [] }
  await db.transaction(async (tx) => {
    for (const [index, item] of parsed.entries()) {
      const values = {
        kind: item.kind,
        status: item.status,
        title: item.title,
        display: item.display,
        tags: item.tags,
        skills: item.skills,
        evidence: item.evidence,
        doNotClaim: item.doNotClaim,
        confidential: item.confidential,
        sortOrder: index,
        source: "my-cv import",
      }
      const [entry] = await tx
        .insert(entries)
        .values({ ...values, profileId: profile.id, key: item.key })
        .onConflictDoUpdate({ target: [entries.profileId, entries.key], set: values })
        .returning()
      await tx.delete(phrasings).where(eq(phrasings.entryId, entry.id))
      await tx.delete(facts).where(eq(facts.entryId, entry.id))
      const savedFacts = item.facts.length
        ? await tx.insert(facts).values(item.facts.map((statement, i) => ({ entryId: entry.id, statement, sortOrder: i }))).returning()
        : []
      if (item.phrasings.length) {
        const links = linkPhrasings(item.phrasings, savedFacts)
        await tx.insert(phrasings).values(
          item.phrasings.map((phrasing, i) => {
            const support = links[i]
            if (phrasing.role === "bullet" && !support.grounded) {
              summary.ungrounded.push({ entry: item.title, text: phrasing.text, numbers: support.unsupportedNumbers })
            }
            return { entryId: entry.id, group: phrasing.group, role: phrasing.role, language: phrasing.language, text: phrasing.text, sortOrder: i, factIds: support.factIds }
          }),
        )
      }
      summary.entries += 1
      summary.facts += savedFacts.length
      summary.phrasings += item.phrasings.length
    }
  })
  summary.logos = await attachLogos(folder, profile.id)
  if (!profile.photoPath) {
    const photo = await readFile(join(folder, "..", "assets", "profile_image.png")).catch(() => null)
    if (photo) {
      const stored = await storePhoto(photo).catch(() => null)
      if (stored) await db.update(profiles).set({ photoPath: stored.path }).where(eq(profiles.id, profile.id))
    }
  }
  return summary
}

const LOGO_KINDS = ["experience", "education", "project", "certification", "achievement"] as const

/**
 * Give entries without a logo the best match from <folder>/../assets/*_logos.
 * Never overrides a logo the user already chose.
 */
async function attachLogos(profileFolder: string, profileId: string) {
  const assetsDir = join(profileFolder, "..", "assets")
  const candidates: { file: string; aspect: number | null; abs: string }[] = []
  for (const sub of ["companies_logos", "schools_logos"]) {
    const names = await readdir(join(assetsDir, sub)).catch(() => [] as string[])
    for (const name of names) {
      const abs = join(assetsDir, sub, name)
      const size = imageSize(await readFile(abs).catch(() => Buffer.alloc(0)))
      candidates.push({ file: `${sub}/${name}`, abs, aspect: size ? size.width / size.height : null })
    }
  }
  if (!candidates.length) return 0
  const missing = await db
    .select()
    .from(entries)
    .where(and(eq(entries.profileId, profileId), isNull(entries.logoPath), inArray(entries.kind, [...LOGO_KINDS])))
  let attached = 0
  for (const entry of missing) {
    const organization = entry.display.en?.organization || entry.display.fr?.organization || entry.title
    const file = matchLogo(organization, candidates) ?? matchLogo(entry.title, candidates)
    if (!file) continue
    const source = candidates.find((candidate) => candidate.file === file)!
    try {
      const stored = await storeLogo(await readFile(source.abs))
      await db.update(entries).set({ logoPath: stored.path }).where(eq(entries.id, entry.id))
      attached += 1
    } catch {
      // unreadable or unsupported file: skip, the user can upload one
    }
  }
  return attached
}

export async function getEntry(entryId: string) {
  const all = await listEntries()
  return all.find((entry) => entry.id === entryId) ?? null
}

/* ------------------------------------------------------------------ */
/* review queue                                                        */
/* ------------------------------------------------------------------ */

export type ReviewItem =
  | {
      type: "bullet"
      id: string
      entry: ProfileEntry
      bullet: ProfileEntry["phrasings"][number]
      suggestions: { id: string; score: number; sharedNumbers: string[] }[]
    }
  | { type: "entry"; id: string; entry: ProfileEntry; reasons: string[] }

/** Everything that blocks an entry from being trusted, one item at a time. */
export async function getReviewQueue(): Promise<ReviewItem[]> {
  const all = (await listEntries()).filter((entry) => entry.status !== "archived")
  const items: ReviewItem[] = []
  for (const entry of all) {
    const facts = entry.facts.map((fact) => ({ id: fact.id, statement: fact.statement }))
    for (const bullet of entry.phrasings) {
      if (bullet.role !== "bullet" || bullet.grounding.grounded) continue
      items.push({ type: "bullet", id: `bullet:${bullet.id}`, entry, bullet, suggestions: rankFacts(bullet.text, facts).filter((item) => item.score >= 0.2).slice(0, 5) })
    }
    const reasons: string[] = []
    if (entry.status === "needs_review") reasons.push("Not verified yet")
    if (entry.facts.length === 0 && entry.kind !== "skill" && entry.kind !== "language") reasons.push("No facts")
    if (reasons.length) items.push({ type: "entry", id: `entry:${entry.id}`, entry, reasons })
  }
  return items
}

async function bulletWithEntryFacts(phrasingId: string) {
  const [bullet] = await db.select().from(phrasings).where(eq(phrasings.id, phrasingId))
  if (!bullet) throw new Error("This bullet no longer exists.")
  const entryFacts = await db.select().from(facts).where(eq(facts.entryId, bullet.entryId))
  return { bullet, entryFacts }
}

/** Link facts (of the same entry only) to a bullet. Returns the new grounding. */
export async function linkBulletFacts(phrasingId: string, factIds: string[]) {
  const { bullet, entryFacts } = await bulletWithEntryFacts(phrasingId)
  const allowed = entryFacts.filter((fact) => factIds.includes(fact.id))
  if (allowed.length !== new Set(factIds).size) throw new Error("Facts must belong to the same entry.")
  await db.update(phrasings).set({ factIds: allowed.map((fact) => fact.id) }).where(eq(phrasings.id, phrasingId))
  return verifySupport(bullet.text, allowed)
}

/** Record a new fact on the bullet's entry and link it (plus any already linked). */
export async function addFactForBullet(phrasingId: string, statement: string, alsoLink: string[] = []) {
  const text = statement.trim()
  if (text.length < 3) throw new Error("Write the fact you can prove.")
  const { bullet, entryFacts } = await bulletWithEntryFacts(phrasingId)
  return db.transaction(async (tx) => {
    const [fact] = await tx.insert(facts).values({ entryId: bullet.entryId, statement: text, sortOrder: entryFacts.length }).returning()
    const keep = entryFacts.filter((item) => alsoLink.includes(item.id))
    const linked = [...keep, fact]
    await tx.update(phrasings).set({ factIds: linked.map((item) => item.id) }).where(eq(phrasings.id, phrasingId))
    return verifySupport(bullet.text, linked)
  })
}

export async function setBulletRole(phrasingId: string, role: "bullet" | "label") {
  await db.update(phrasings).set({ role }).where(eq(phrasings.id, phrasingId))
}

/** Saves imported entries as "needs review" and fills only empty identity fields. Skips entries already in the profile. */
export async function saveImportedProfile(input: {
  language: string
  identity: { fullName: string; headline: string; email: string; phone: string; location: string; links: { label: string; url: string }[] }
  entries: { kind: EntryInput["kind"]; title: string; display: { role: string; organization: string; dates: string; location: string }; facts: string[]; skills: string[]; bullets: { text: string; facts: number[] }[] }[]
}, { dedupe = true }: { dedupe?: boolean } = {}) {
  const profile = await requireProfile()
  const existing = await db.select({ kind: entries.kind, title: entries.title, display: entries.display }).from(entries).where(eq(entries.profileId, profile.id))
  const key = (kind: string, title: string) => `${kind}:${title.trim().toLowerCase()}`
  const seen = new Set(existing.flatMap((row) => {
    const shown = Object.values((row.display ?? {}) as Record<string, { role?: string; organization?: string }>)
    return [key(row.kind, row.title), ...shown.map((value) => key(row.kind, `${value.role ?? ""}@${value.organization ?? ""}`))]
  }))
  let created = 0
  let skipped = 0
  for (const item of input.entries) {
    if (dedupe && (seen.has(key(item.kind, item.title)) || (item.display.role && seen.has(key(item.kind, `${item.display.role}@${item.display.organization}`))))) {
      skipped += 1
      continue
    }
    const shown = Object.fromEntries(Object.entries(item.display).filter(([, value]) => value.trim()))
    await saveEntry({
      title: item.title, kind: item.kind, status: "needs_review",
      display: Object.keys(shown).length ? { [input.language]: shown } : {},
      skills: item.skills, facts: item.facts.map((statement) => ({ statement })),
      phrasings: item.bullets.map((bullet) => ({ group: "Imported", role: "bullet" as const, language: input.language, text: bullet.text, factRefs: bullet.facts })),
    })
    seen.add(key(item.kind, item.title))
    created += 1
  }
  const empty = (value: string | null | undefined) => !value || !value.trim() || value === "Your name"
  const patch: Partial<typeof profiles.$inferInsert> = {}
  const id = input.identity
  if (empty(profile.fullName) && id.fullName.trim().length >= 2) patch.fullName = id.fullName.trim()
  if (empty(profile.email) && /^\S+@\S+\.\S+$/.test(id.email.trim())) patch.email = id.email.trim()
  if (empty(profile.phone) && id.phone.trim()) patch.phone = id.phone.trim()
  if (empty(profile.location) && id.location.trim()) patch.location = id.location.trim()
  const headlines = (profile.headlines ?? {}) as Record<string, string>
  if (id.headline.trim() && empty(headlines[input.language])) patch.headlines = { ...headlines, [input.language]: id.headline.trim() }
  const links = (profile.links ?? []) as { label: string; url: string }[]
  const normalized = id.links.map((link) => ({ label: link.label.trim() || "Link", url: /^https?:\/\//i.test(link.url.trim()) ? link.url.trim() : /^[a-z0-9-]+(\.[a-z0-9-]+)+(\/\S*)?$/i.test(link.url.trim()) ? `https://${link.url.trim()}` : "" }))
  const newLinks = normalized.filter((link) => link.url && URL.canParse(link.url) && !links.some((known) => known.url === link.url))
  if (newLinks.length) patch.links = [...links, ...newLinks].slice(0, 12)
  if (Object.keys(patch).length) await db.update(profiles).set(patch).where(eq(profiles.id, profile.id))
  return { created, skipped, identityFields: Object.keys(patch) }
}

/** Existing entries in the shape the import matcher needs. */
export async function entriesForMatching() {
  const profile = await getProfile()
  if (!profile) return []
  const rows = await db.select().from(entries).where(eq(entries.profileId, profile.id))
  const factRows = rows.length ? await db.select({ entryId: facts.entryId, statement: facts.statement }).from(facts).where(inArray(facts.entryId, rows.map((row) => row.id))) : []
  return rows.filter((row) => row.status !== "archived").map((row) => ({
    id: row.id, kind: row.kind, title: row.title, status: row.status,
    display: (row.display ?? {}) as Record<string, { role?: string; organization?: string; dates?: string }>,
    facts: factRows.filter((fact) => fact.entryId === row.id).map((fact) => fact.statement),
    skills: row.skills,
  }))
}

/**
 * Adds new facts and skills to an existing entry without touching what is
 * there (existing fact ids stay stable for analyses and documents). The entry
 * goes back to "needs review" when it gains facts, so unverified claims never
 * reach a CV unnoticed.
 */
export async function mergeIntoEntry(entryId: string, input: { facts: string[]; skills: string[]; display?: { language: string; role: string; organization: string; dates: string; location: string } }) {
  return db.transaction(async (tx) => {
    const [entry] = await tx.select().from(entries).where(eq(entries.id, entryId)).for("update")
    if (!entry) throw new Error("Entry not found.")
    const existing = await tx.select({ statement: facts.statement, sortOrder: facts.sortOrder }).from(facts).where(eq(facts.entryId, entryId))
    const fresh = [...new Set(input.facts.map((fact) => fact.trim()).filter((fact) => fact.length >= 3 && !existing.some((known) => known.statement.trim().toLowerCase() === fact.toLowerCase())))]
    const start = existing.reduce((max, fact) => Math.max(max, fact.sortOrder), -1) + 1
    if (fresh.length) await tx.insert(facts).values(fresh.map((statement, index) => ({ entryId, statement, sortOrder: start + index })))
    const skills = [...entry.skills, ...input.skills.filter((skill) => !entry.skills.some((known) => known.toLowerCase() === skill.toLowerCase()))]
    const display = { ...((entry.display ?? {}) as Record<string, Record<string, string>>) }
    if (input.display) {
      const current = display[input.display.language] ?? {}
      const filled = Object.fromEntries((["role", "organization", "dates", "location"] as const).map((key) => [key, current[key] || input.display![key] || ""]).filter(([, value]) => value))
      if (Object.keys(filled).length) display[input.display.language] = filled
    }
    await tx.update(entries).set({ skills, display, ...(fresh.length && entry.status === "verified" ? { status: "needs_review" as const } : {}) }).where(eq(entries.id, entryId))
    return { added: fresh.length, skills: skills.length - entry.skills.length, reverified: Boolean(fresh.length && entry.status === "verified") }
  })
}
