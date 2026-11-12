import "server-only"
import { readdir, readFile } from "node:fs/promises"
import { basename, join } from "node:path"
import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm"
import { imageSize } from "@/server/assets/image"
import { storeLogo, storePhoto } from "@/server/assets/store"
import { db } from "@/server/db/client"
import { entries, facts, phrasings, profiles } from "@/server/db/schema"
import { supportFor, verifySupport } from "@/server/domain/grounding"
import { searchGoals } from "@/lib/search-goals"
import { cleanText, entryName, entryView, hasHeading, KIND_FIELDS, looseFields, type EntryFields, type EntryText } from "@/lib/entry-fields"
import { matchLogo } from "./logo-match"
import { queueTranslation } from "./auto-translate"
import { parseIdentity, parsePool } from "./pool-parser"
import { entryInput, identityInput, importedEntryInput, profileDetailEdit, type EntryInput, type IdentityInput } from "./schemas"

/** Single-user app: the first profile is the profile. */
export async function getProfile() {
  const [profile] = await db.select().from(profiles).orderBy(asc(profiles.createdAt)).limit(1)
  if (!profile) return null
  // Goals saved before a field existed lack it: fill the defaults, so every reader sees whole goals.
  const goals = searchGoals.safeParse(profile.goals)
  return { ...profile, goals: goals.success ? goals.data : [] }
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
  if (saved.location !== profile.location) await refreshVerdicts()
  return saved
}

export async function saveGoals(input: unknown) {
  const goals = searchGoals.parse(input)
  const profile = await requireProfile()
  await db.update(profiles).set({ goals }).where(eq(profiles.id, profile.id))
  await refreshVerdicts()
}

/** Apply just the approved edit and reject it if the original value has changed. */
export async function editProfileDetails(input: unknown) {
  const edit = profileDetailEdit.parse(input)
  await db.transaction(async (tx) => {
    const [profile] = await tx.select().from(profiles).orderBy(asc(profiles.createdAt)).limit(1).for("update")
    if (!profile) throw new Error("Set up your profile before editing its details.")

    if (edit.kind === "field") {
      const value = identityInput.shape[edit.field].parse(edit.value)
      if (profile[edit.field] !== edit.previous) throw new Error("This profile detail changed. Ask Naruvi to propose the edit again.")
      await tx.update(profiles).set({ [edit.field]: value }).where(eq(profiles.id, profile.id))
      return
    }

    const { previous, value } = edit
    if (!previous && !value) throw new Error("Choose a link to add, update, or remove.")
    const matches = previous ? profile.links.filter((link) => link.label === previous.label && link.url === previous.url) : []
    if (previous && matches.length !== 1) throw new Error("The original link changed or is duplicated. Check your current profile links.")
    if (value && profile.links.some((link) => link !== matches[0] && link.url === value.url)) {
      throw new Error("That URL is already on your profile.")
    }

    const links = previous
      ? profile.links.flatMap((link) => link === matches[0] ? (value ? [value] : []) : [link])
      : value ? [...profile.links, value] : profile.links
    await tx.update(profiles).set({ links }).where(eq(profiles.id, profile.id))
  })
  if (edit.kind === "field" && edit.field === "location") await refreshVerdicts()
}

/** Goals and location decide every job's goal verdict. Imported lazily: the jobs module reads the profile. */
const refreshVerdicts = async () => (await import("@/server/jobs/goals")).refreshGoalVerdicts()

/** Entries with facts and phrasings; each phrasing carries its grounding check. */
export async function listEntries() {
  const profile = await getProfile()
  if (!profile) return []
  const rows = await db.select().from(entries).where(eq(entries.profileId, profile.id)).orderBy(asc(entries.kind), asc(entries.sortOrder), asc(entries.createdAt))
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
export async function saveEntry(input: EntryInput, entryId?: string, { imported = false } = {}) {
  const saved = await writeEntry(input, entryId, imported)
  queueTranslation([saved.id])
  return saved
}

async function writeEntry(input: EntryInput, entryId?: string, imported = false) {
  const data = (imported ? importedEntryInput : entryInput).parse(input)
  const profile = await requireProfile()
  return db.transaction(async (tx) => {
    const values = {
      kind: data.kind,
      status: data.status,
      display: data.display,
      fields: data.fields,
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
    // Facts are rewritten on every save: keep the translations of unchanged statements so they aren't redone.
    const previous = entryId ? await tx.select({ statement: facts.statement, translations: facts.translations }).from(facts).where(eq(facts.entryId, entry.id)) : []
    const known = new Map(previous.map((fact) => [fact.statement, fact.translations]))
    await tx.delete(facts).where(eq(facts.entryId, entry.id))
    const savedFacts = data.facts.length
      ? await tx
          .insert(facts)
          .values(data.facts.map((fact, index) => ({ entryId: entry.id, statement: fact.statement, sortOrder: index, translations: known.get(fact.statement) ?? {} })))
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
          autoText: phrasing.autoText ?? null,
          autoSource: phrasing.autoSource ?? null,
          factIds: phrasing.factRefs
            ? phrasing.factRefs.map((ref) => savedFacts[ref]?.id).filter((id): id is string => Boolean(id))
            : supportFor(phrasing.text, savedFacts).factIds,
        })),
      )
    }
    return entry
  })
}

/** Set some of an entry's own fields (approved by the user, e.g. from the assistant). Empty strings clear. */
export async function updateEntryFields(entryId: string, input: { language: string; text: Record<string, string>; fields: Record<string, unknown> }) {
  const profile = await getProfile()
  const [entry] = await db.select().from(entries).where(eq(entries.id, entryId))
  if (!entry || entry.profileId !== profile?.id) throw new Error("Entry not found.")
  const known = new Set(KIND_FIELDS[entry.kind].map((spec) => spec.key))
  const unknown = [...Object.keys(input.text), ...Object.keys(input.fields)].filter((key) => !known.has(key))
  if (unknown.length) throw new Error(`A ${entry.kind} has no ${unknown.join(", ")} field. Its fields: ${[...known].join(", ")}.`)
  const merged = (base: Record<string, unknown>, changes: Record<string, unknown>) => Object.fromEntries(Object.entries({ ...base, ...changes }).filter(([, value]) => value !== "" && value != null))
  const display = { ...entry.display, [input.language]: merged(entry.display[input.language] ?? {}, input.text) as Record<string, string> }
  const fields = merged(entry.fields, Object.fromEntries(Object.entries(input.fields).map(([key, value]) => [key, value === "" ? "" : looseFields(entry.kind, { [key]: value })[key] ?? (() => { throw new Error(`"${String(typeof value === "string" ? value : JSON.stringify(value))}" is not a valid ${key}.`) })()])))
  const parsed = entryInput.parse({ kind: entry.kind, status: entry.status, display, fields })
  const [saved] = await db.update(entries).set({ display: parsed.display, fields: parsed.fields }).where(eq(entries.id, entryId)).returning()
  queueTranslation([saved.id])
  return saved
}

/** Create one entry from kind-specific fields (assistant, after the user approved it). Same validation as updateEntryFields. */
export async function createEntryFromFields(input: { kind: EntryInput["kind"]; language: string; text: Record<string, string>; fields: Record<string, unknown>; facts: string[]; skills: string[] }) {
  const known = new Set(KIND_FIELDS[input.kind].map((spec) => spec.key))
  const unknown = [...Object.keys(input.text), ...Object.keys(input.fields)].filter((key) => !known.has(key))
  if (unknown.length) throw new Error(`A ${input.kind} has no ${unknown.join(", ")} field. Its fields: ${[...known].join(", ")}.`)
  const text = Object.fromEntries(Object.entries(input.text).map(([key, value]) => [key, value.trim()]).filter(([, value]) => value))
  const fields = Object.fromEntries(Object.entries(input.fields).filter(([, value]) => value !== "" && value != null).map(([key, value]) => [key, looseFields(input.kind, { [key]: value })[key] ?? (() => { throw new Error(`"${String(typeof value === "string" ? value : JSON.stringify(value))}" is not a valid ${key}.`) })()]))
  return saveEntry({
    kind: input.kind,
    status: "verified",
    display: Object.keys(text).length ? { [input.language]: text } : {},
    fields,
    skills: [...new Set(input.skills.map((skill) => skill.trim()).filter(Boolean))],
    facts: input.facts.map((statement) => ({ statement })),
  } as EntryInput)
}

/** One entry of this profile, or an error the assistant can show. */
async function ownEntry(entryId: string) {
  const profile = await getProfile()
  const [entry] = await db.select().from(entries).where(eq(entries.id, entryId))
  if (!entry || entry.profileId !== profile?.id) throw new Error("Entry not found.")
  return entry
}

/** Change an entry's status (verify it, send it back to review, archive or restore it). */
export async function changeEntryStatus(entryId: string, status: "verified" | "needs_review" | "archived") {
  const entry = await ownEntry(entryId)
  await setEntryStatus(entryId, status)
  return { name: entryName(entry), previous: entry.status, status }
}

export async function removeEntry(entryId: string) {
  const entry = await ownEntry(entryId)
  await deleteEntry(entryId)
  return { name: entryName(entry) }
}

/** Reword one fact, or remove it (statement null). A removed fact is also unlinked from CV lines. */
export async function changeFact(entryId: string, factId: string, statement: string | null) {
  const entry = await ownEntry(entryId)
  const [fact] = await db.select().from(facts).where(and(eq(facts.id, factId), eq(facts.entryId, entryId)))
  if (!fact) throw new Error("Fact not found on this entry.")
  await db.transaction(async (tx) => {
    if (statement === null) {
      await tx.update(phrasings).set({ factIds: sql`array_remove(${phrasings.factIds}, ${factId}::uuid)` }).where(eq(phrasings.entryId, entryId))
      await tx.delete(facts).where(eq(facts.id, factId))
    } else {
      await tx.update(facts).set({ statement: statement.trim() }).where(eq(facts.id, factId))
    }
  })
  return { name: entryName(entry), previous: fact.statement }
}

/** Remove skills (case-insensitive) from an entry. */
export async function removeSkills(entryId: string, skills: string[]) {
  const entry = await ownEntry(entryId)
  const drop = new Set(skills.map((skill) => skill.trim().toLowerCase()))
  const kept = entry.skills.filter((skill) => !drop.has(skill.trim().toLowerCase()))
  await db.update(entries).set({ skills: kept }).where(eq(entries.id, entryId))
  return { name: entryName(entry), removed: entry.skills.length - kept.length }
}

/** NDA flag and "never claim" rules sent to every prompt that uses this entry. */
export async function setEntryGuards(entryId: string, input: { confidential?: boolean; addRules?: string[]; removeRules?: string[] }) {
  const entry = await ownEntry(entryId)
  const remove = new Set((input.removeRules ?? []).map((rule) => rule.trim().toLowerCase()))
  const rules = [...entry.doNotClaim.filter((rule) => !remove.has(rule.trim().toLowerCase()))]
  for (const rule of input.addRules ?? []) if (rule.trim() && !rules.some((known) => known.toLowerCase() === rule.trim().toLowerCase())) rules.push(rule.trim())
  await db.update(entries).set({ doNotClaim: rules, ...(input.confidential === undefined ? {} : { confidential: input.confidential }) }).where(eq(entries.id, entryId))
  return { name: entryName(entry), confidential: input.confidential ?? entry.confidential, rules }
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
  const imported: string[] = []
  await db.transaction(async (tx) => {
    for (const [index, item] of parsed.entries()) {
      const values = {
        kind: item.kind,
        status: item.status,
        display: item.display,
        fields: item.fields,
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
              summary.ungrounded.push({ entry: item.name, text: phrasing.text, numbers: support.unsupportedNumbers })
            }
            return { entryId: entry.id, group: phrasing.group, role: phrasing.role, language: phrasing.language, text: phrasing.text, sortOrder: i, factIds: support.factIds }
          }),
        )
      }
      imported.push(entry.id)
      summary.entries += 1
      summary.facts += savedFacts.length
      summary.phrasings += item.phrasings.length
    }
  })
  queueTranslation(imported)
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
    const view = entryView(entry, "en")
    const file = (view.subheading && matchLogo(view.subheading, candidates)) || matchLogo(view.heading, candidates)
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

export type ReviewItem = { type: "entry"; id: string; entry: ProfileEntry; reasons: string[] }

/** Everything that blocks an entry from being trusted, one item at a time. */
export async function getReviewQueue(): Promise<ReviewItem[]> {
  const all = (await listEntries()).filter((entry) => entry.status !== "archived")
  const items: ReviewItem[] = []
  for (const entry of all) {
    const reasons: string[] = []
    if (entry.status === "needs_review") reasons.push("Not verified yet")
    if (entry.facts.length === 0 && (entry.kind === "experience" || entry.kind === "project")) reasons.push("No facts")
    if (reasons.length) items.push({ type: "entry", id: `entry:${entry.id}`, entry, reasons })
  }
  return items
}

/** Saves imported entries as "needs review" and fills only empty identity fields. Skips entries already in the profile. */
export async function saveImportedProfile(input: {
  language: string
  identity: { fullName: string; headline: string; email: string; phone: string; location: string; links: { label: string; url: string }[] }
  entries: { kind: EntryInput["kind"]; text: Record<string, string>; fields: EntryFields; facts: string[]; skills: string[]; bullets: { text: string; facts: number[] }[] }[]
}, { dedupe = true, status = "needs_review" }: { dedupe?: boolean; status?: "verified" | "needs_review" } = {}) {
  const profile = await requireProfile()
  const existing = await db.select({ kind: entries.kind, display: entries.display, fields: entries.fields }).from(entries).where(eq(entries.profileId, profile.id))
  const key = (kind: string, name: string) => `${kind}:${name.trim().toLowerCase()}`
  const seen = new Set(existing.flatMap((row) => Object.keys(row.display).concat("en").map((lang) => key(row.kind, entryName(row, lang)))))
  let created = 0
  let skipped = 0
  /** Entries that could not be saved (kept out of the profile, reported to the person). */
  const failed: { name: string; reason: string }[] = []
  for (const item of input.entries) {
    const shaped = { kind: item.kind, display: Object.keys(item.text).length ? { [input.language]: item.text } : {}, fields: item.fields }
    const name = key(item.kind, entryName(shaped, input.language))
    if (dedupe && seen.has(name)) {
      skipped += 1
      continue
    }
    // Without its name an entry can't be verified: keep it, flagged for the person to complete.
    const unnamed = !hasHeading(shaped, input.language)
    try {
      await saveEntry({
        ...shaped, status: unnamed ? "needs_review" : status,
        skills: item.skills, facts: item.facts.map((statement) => ({ statement })),
        phrasings: item.bullets.filter((bullet) => bullet.facts.length).map((bullet) => ({ group: "Imported", role: "bullet" as const, language: input.language, text: bullet.text, factRefs: bullet.facts })),
      }, undefined, { imported: true })
    } catch (error) {
      console.error("[naruvi] import entry:", error instanceof Error ? error.message : error)
      failed.push({ name: entryName(shaped, input.language), reason: error instanceof Error ? error.message : String(error) })
      continue
    }
    seen.add(name)
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
  return { created, skipped, failed, identityFields: Object.keys(patch) }
}

/** Existing entries in the shape the import matcher needs. */
export async function entriesForMatching() {
  const profile = await getProfile()
  if (!profile) return []
  const rows = await db.select().from(entries).where(eq(entries.profileId, profile.id))
  const factRows = rows.length ? await db.select({ entryId: facts.entryId, statement: facts.statement }).from(facts).where(inArray(facts.entryId, rows.map((row) => row.id))) : []
  return rows.filter((row) => row.status !== "archived").map((row) => ({
    id: row.id, kind: row.kind, status: row.status, display: row.display, fields: row.fields,
    facts: factRows.filter((fact) => fact.entryId === row.id).map((fact) => fact.statement),
    skills: row.skills,
  }))
}

/**
 * Adds new facts and skills to an existing entry without touching what is
 * there (existing fact ids stay stable for analyses and documents). The entry
 * goes back to "needs review" when it gains imported facts. An explicit user
 * approval keeps an already verified entry verified.
 */
export async function mergeIntoEntry(entryId: string, input: { facts: string[]; skills: string[]; display?: { language: string; text: EntryText[string]; fields: EntryFields } }, { approvedByUser = false } = {}) {
  const profile = approvedByUser ? await getProfile() : null
  return db.transaction(async (tx) => {
    const [entry] = await tx.select().from(entries).where(eq(entries.id, entryId)).for("update")
    if (!entry || (approvedByUser && (entry.profileId !== profile?.id || entry.status === "archived"))) {
      throw new Error("Entry not found.")
    }
    const existing = await tx.select({ statement: facts.statement, sortOrder: facts.sortOrder }).from(facts).where(eq(facts.entryId, entryId))
    const fresh = [...new Set(input.facts.map((fact) => fact.trim()).filter((fact) => fact.length >= 3 && !existing.some((known) => known.statement.trim().toLowerCase() === fact.toLowerCase())))]
    const start = existing.reduce((max, fact) => Math.max(max, fact.sortOrder), -1) + 1
    if (fresh.length) await tx.insert(facts).values(fresh.map((statement, index) => ({ entryId, statement, sortOrder: start + index })))
    const skills = [...entry.skills]
    const knownSkills = new Set(skills.map((skill) => skill.trim().toLowerCase()))
    for (const skill of input.skills) {
      const key = skill.trim().toLowerCase()
      if (knownSkills.has(key)) continue
      knownSkills.add(key)
      skills.push(skill)
    }
    // Fill only what is empty: never overwrite a field the person already has.
    const display = { ...entry.display }
    let fields = entry.fields
    if (input.display) {
      const current = display[input.display.language] ?? {}
      const offered = cleanText(entry.kind, { [input.display.language]: input.display.text })[input.display.language] ?? {}
      display[input.display.language] = { ...offered, ...Object.fromEntries(Object.entries(current).filter(([, value]) => value)) }
      fields = { ...looseFields(entry.kind, input.display.fields), ...Object.fromEntries(Object.entries(entry.fields).filter(([, value]) => value)) }
    }
    const needsReview = !approvedByUser && fresh.length > 0 && entry.status === "verified"
    await tx.update(entries).set({ skills, display, fields, ...(needsReview ? { status: "needs_review" as const } : {}) }).where(eq(entries.id, entryId))
    if (input.display || fresh.length) queueTranslation([entryId])
    return { added: fresh.length, skills: skills.length - entry.skills.length, reverified: needsReview, verified: entry.status === "verified" && !needsReview }
  })
}
