import "server-only"
import { readdir, readFile } from "node:fs/promises"
import { basename, join } from "node:path"
import { asc, eq, inArray } from "drizzle-orm"
import { db } from "@/server/db/client"
import { entries, facts, phrasings, profiles } from "@/server/db/schema"
import { supportFor, verifySupport } from "@/server/domain/grounding"
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

export type ImportSummary = { entries: number; facts: number; phrasings: number; ungrounded: { entry: string; text: string; numbers: string[] }[] }

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

  const summary: ImportSummary = { entries: 0, facts: 0, phrasings: 0, ungrounded: [] }
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
  return summary
}

export async function getEntry(entryId: string) {
  const all = await listEntries()
  return all.find((entry) => entry.id === entryId) ?? null
}
