import "server-only"
import { and, desc, eq, ilike, inArray, or, sql } from "drizzle-orm"
import { z } from "zod"
import { env } from "@/lib/env"
import type { ContactRow } from "@/lib/contact-import"
import { likePattern } from "@/lib/search"
import { db } from "@/server/db/client"
import { applicationContacts, applications, companies, contacts, jobs, settings } from "@/server/db/schema"
import { slugify } from "@/server/jobs/ingest"
import { decryptSecret, encryptSecret, encryptionReady } from "@/server/settings/encryption"
import { SettingsError } from "@/server/settings/errors"

export const contactInput = z.object({
  name: z.string().trim().min(1, "Enter a name").max(120),
  title: z.string().trim().max(160).default(""),
  companyName: z.string().trim().max(160).default(""),
  email: z.string().trim().toLowerCase().email("Enter a valid email").max(254).or(z.literal("")).default(""),
  linkedinUrl: z.string().trim().max(500).refine((url) => !url || /^https?:\/\/([a-z]{2,3}\.)?linkedin\.com\/in\//i.test(url), "Use a LinkedIn profile link (linkedin.com/in/…)").default(""),
  phone: z.string().trim().max(40).default(""),
  notes: z.string().trim().max(2000).default(""),
  source: z.enum(["manual", "import", "extension", "email"]).default("manual"),
})
export type ContactInput = z.input<typeof contactInput>

/** A known company for this name (by slug), so contacts and jobs meet on the same company page. */
async function companyFor(name: string) {
  if (!name.trim()) return null
  const [row] = await db.select({ id: companies.id }).from(companies).where(eq(companies.slug, slugify(name)))
  return row?.id ?? null
}

export async function listContacts(q?: string) {
  const query = q?.trim()
  const rows = await db
    .select({
      id: contacts.id, name: contacts.name, title: contacts.title, email: contacts.email, emailSource: contacts.emailSource, linkedinUrl: contacts.linkedinUrl, phone: contacts.phone, notes: contacts.notes, source: contacts.source, updatedAt: contacts.updatedAt,
      companyId: contacts.companyId, company: sql<string>`coalesce(${companies.name}, ${contacts.companyName})`, logoPath: companies.logoPath,
      applications: sql<number>`(select count(*) from ${applicationContacts} where ${applicationContacts.contactId} = ${contacts.id})`.mapWith(Number),
    })
    .from(contacts)
    .leftJoin(companies, eq(companies.id, contacts.companyId))
    .where(query ? or(ilike(contacts.name, likePattern(query)), ilike(contacts.title, likePattern(query)), ilike(contacts.email, likePattern(query)), ilike(contacts.companyName, likePattern(query)), ilike(companies.name, likePattern(query))) : undefined)
    .orderBy(desc(contacts.updatedAt))
    .limit(500)
  return rows
}
export type ContactListItem = Awaited<ReturnType<typeof listContacts>>[number]

export async function getContact(id: string) {
  const [contact] = await db
    .select({ contact: contacts, company: { id: companies.id, name: companies.name, website: companies.website, logoPath: companies.logoPath } })
    .from(contacts)
    .leftJoin(companies, eq(companies.id, contacts.companyId))
    .where(eq(contacts.id, id))
  if (!contact) return null
  const linked = await db
    .select({ id: applications.id, role: applicationContacts.role, status: applications.status, title: jobs.title })
    .from(applicationContacts)
    .innerJoin(applications, eq(applications.id, applicationContacts.applicationId))
    .innerJoin(jobs, eq(jobs.id, applications.jobId))
    .where(eq(applicationContacts.contactId, id))
  return { ...contact.contact, company: contact.company?.id ? contact.company : null, applications: linked }
}

export async function saveContact(raw: ContactInput, id?: string) {
  const input = contactInput.parse(raw)
  const companyId = await companyFor(input.companyName)
  const values = { ...input, companyId, emailSource: input.email ? (input.source === "manual" ? "you" : input.source) : "" }
  if (id) {
    const [current] = await db.select({ email: contacts.email, emailSource: contacts.emailSource }).from(contacts).where(eq(contacts.id, id))
    if (!current) throw new Error("Contact not found.")
    // Keep where an unchanged email came from (e.g. an email finder).
    const [row] = await db.update(contacts).set({ ...values, source: undefined, emailSource: current.email === input.email ? current.emailSource : values.emailSource }).where(eq(contacts.id, id)).returning({ id: contacts.id })
    return row.id
  }
  // The same LinkedIn profile is the same person: update instead of duplicating.
  if (input.linkedinUrl) {
    const [existing] = await db.select({ id: contacts.id }).from(contacts).where(eq(contacts.linkedinUrl, input.linkedinUrl))
    if (existing) {
      await db.update(contacts).set({ name: input.name, title: input.title || undefined, companyName: input.companyName || undefined, companyId: companyId ?? undefined }).where(eq(contacts.id, existing.id))
      return existing.id
    }
  }
  const [row] = await db.insert(contacts).values(values).returning({ id: contacts.id })
  return row.id
}

export async function deleteContact(id: string) {
  await db.delete(contacts).where(eq(contacts.id, id))
}

/** Bulk import; matches existing people by LinkedIn URL, then email. */
export async function importContacts(rows: ContactRow[]) {
  let created = 0
  let updated = 0
  const urls = rows.map((row) => row.linkedinUrl).filter(Boolean)
  const emails = rows.map((row) => row.email).filter(Boolean)
  const existing = urls.length || emails.length
    ? await db.select({ id: contacts.id, linkedinUrl: contacts.linkedinUrl, email: contacts.email }).from(contacts).where(or(urls.length ? inArray(contacts.linkedinUrl, urls) : undefined, emails.length ? inArray(contacts.email, emails) : undefined))
    : []
  for (const row of rows.slice(0, 5000)) {
    const match = existing.find((item) => (row.linkedinUrl && item.linkedinUrl === row.linkedinUrl) || (row.email && item.email === row.email))
    const companyId = await companyFor(row.companyName)
    if (match) {
      await db.update(contacts).set({ name: row.name, ...(row.title ? { title: row.title } : {}), ...(row.companyName ? { companyName: row.companyName, companyId } : {}), ...(row.email ? { email: row.email, emailSource: "import" } : {}), ...(row.phone ? { phone: row.phone } : {}) }).where(eq(contacts.id, match.id))
      updated += 1
    } else {
      await db.insert(contacts).values({ ...row, companyId, source: "import", emailSource: row.email ? "import" : "" })
      created += 1
    }
  }
  return { created, updated }
}

export async function contactsForCompany(companyId: string) {
  return db.select().from(contacts).where(eq(contacts.companyId, companyId)).orderBy(contacts.name)
}

export async function contactsForApplication(applicationId: string) {
  return db
    .select({ id: contacts.id, name: contacts.name, title: contacts.title, email: contacts.email, linkedinUrl: contacts.linkedinUrl, role: applicationContacts.role })
    .from(applicationContacts)
    .innerJoin(contacts, eq(contacts.id, applicationContacts.contactId))
    .where(eq(applicationContacts.applicationId, applicationId))
}

export async function linkContact(applicationId: string, contactId: string, role = "") {
  await db.insert(applicationContacts).values({ applicationId, contactId, role }).onConflictDoUpdate({ target: [applicationContacts.applicationId, applicationContacts.contactId], set: { role } })
}

export async function unlinkContact(applicationId: string, contactId: string) {
  await db.delete(applicationContacts).where(and(eq(applicationContacts.applicationId, applicationId), eq(applicationContacts.contactId, contactId)))
}

/**
 * A spontaneous application: a company you'd like to work for without a
 * posting. It is a normal application (CV, letter, email, tracking) built on
 * a "spontaneous" job, and the contact you write to is linked to it.
 */
export async function startSpontaneous(input: { companyName: string; role?: string; contactId?: string; language?: string }) {
  const companyName = input.companyName.trim()
  if (!companyName) throw new Error("Choose a company first.")
  const role = input.role?.trim() || (input.language === "fr" ? "Candidature spontanée" : "Spontaneous application")
  const [company] = await db
    .insert(companies)
    .values({ name: companyName, slug: slugify(companyName) })
    .onConflictDoUpdate({ target: companies.slug, set: { slug: sql`excluded.slug` } })
    .returning({ id: companies.id, name: companies.name })
  const text = input.language === "fr"
    ? `Candidature spontanée chez ${company.name}${input.role ? ` pour un poste de ${input.role}` : ""}.`
    : `Spontaneous application to ${company.name}${input.role ? ` for a ${input.role} role` : ""}.`
  const [job] = await db.insert(jobs).values({ companyId: company.id, board: "spontaneous", title: role, rawText: text, language: input.language ?? "en", parseConfidence: 1 }).returning({ id: jobs.id })
  if (input.contactId) await db.update(contacts).set({ companyId: company.id }).where(and(eq(contacts.id, input.contactId), sql`${contacts.companyId} is null`))
  return { jobId: job.id, companyId: company.id }
}

/* ---------------------------- email finder ---------------------------- */

const FINDER_KEY = "integration.emailFinder"
const finderStored = z.object({ provider: z.literal("hunter"), encryptedKey: z.string() })

export async function emailFinderStatus() {
  const row = await db.query.settings.findFirst({ where: eq(settings.key, FINDER_KEY) })
  return { configured: finderStored.safeParse(row?.value).success, provider: "hunter" as const }
}

export async function saveEmailFinder(apiKey: string) {
  if (!apiKey.trim()) {
    await db.delete(settings).where(eq(settings.key, FINDER_KEY))
    return
  }
  if (!encryptionReady(env.SETTINGS_ENCRYPTION_KEY)) throw new SettingsError("Set SETTINGS_ENCRYPTION_KEY first (npm run settings:key).")
  const value = { provider: "hunter" as const, encryptedKey: encryptSecret(apiKey.trim(), env.SETTINGS_ENCRYPTION_KEY, "finder:hunter") }
  await db.insert(settings).values({ key: FINDER_KEY, value }).onConflictDoUpdate({ target: settings.key, set: { value } })
}

/**
 * Ask Hunter.io for a professional email from a name and the company's own
 * domain. Runs only when you click "Find email" for one contact.
 */
export async function findEmail(contactId: string, fetcher: typeof fetch = fetch) {
  const row = await db.query.settings.findFirst({ where: eq(settings.key, FINDER_KEY) })
  const stored = finderStored.safeParse(row?.value)
  if (!stored.success) throw new SettingsError("Add an email finder key on the Integrations page first.")
  const contact = await getContact(contactId)
  if (!contact) throw new Error("Contact not found.")
  const website = contact.company?.website
  if (!website) throw new Error("Add the company’s website first (open a job from this company, or set it on the company), so the finder knows the domain.")
  const domain = new URL(website).hostname.replace(/^www\./, "")
  const [first, ...rest] = contact.name.split(/\s+/)
  const url = new URL("https://api.hunter.io/v2/email-finder")
  url.search = new URLSearchParams({ domain, first_name: first ?? "", last_name: rest.join(" "), api_key: decryptSecret(stored.data.encryptedKey, env.SETTINGS_ENCRYPTION_KEY, "finder:hunter") }).toString()
  const res = await fetcher(url, { signal: AbortSignal.timeout(15_000), redirect: "error" })
  const body = (await res.json().catch(() => ({}))) as { data?: { email?: string | null; score?: number | null }; errors?: { details?: string }[] }
  if (!res.ok) throw new Error(body.errors?.[0]?.details ?? `The email finder answered ${res.status}.`)
  const email = body.data?.email?.toLowerCase() ?? ""
  if (!email) return { email: "", confidence: 0 }
  const confidence = body.data?.score ?? 0
  await db.update(contacts).set({ email, emailSource: `Hunter.io (${confidence}% confidence)` }).where(eq(contacts.id, contactId))
  return { email, confidence }
}
