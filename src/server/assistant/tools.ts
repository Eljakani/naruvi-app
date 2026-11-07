import "server-only"
import { revalidatePath } from "next/cache"
import { tool } from "ai"
import { z } from "zod"
import { analyzeJob, trackJob } from "@/server/applications/repository"
import { safeFetch } from "@/server/assets/safe-fetch"
import { getCompany, listCompanies, findDuplicates , saveCompany, setCompanyWebsite } from "@/server/companies/repository"
import { MissingWebsite, deleteContact, findEmail, getContact, linkContact, listContacts, saveContact, startSpontaneous } from "@/server/contacts/repository"
import { generateCv, generateLetter } from "@/server/documents/service"
import { apiApplication, apiApplications, apiUpdateApplication } from "@/server/integrations/api-data"
import { getJob, previewJob, saveJob } from "@/server/jobs/ingest"
import { refreshJobInsights } from "@/server/jobs/insights"
import { markLeadImported } from "@/server/jobs/leads"
import { searchJobs } from "@/server/jobs/search"
import { registrableDomain } from "@/server/jobs/vendor/company-resolver"
import { editProfileDetails, entriesForMatching, getProfile, listEntries, mergeIntoEntry } from "@/server/profile/repository"
import { profileDetailEdit, profileDetailFields } from "@/server/profile/schemas"
import { getDashboard } from "@/server/queries/dashboard"
import { extractPage, visiblePageText } from "@/server/research/extract"
import { researchForJob } from "@/server/research/service"
import { scheduleResearch } from "@/server/research/auto"

/**
 * Everything Naruvi's assistant can do. Reading runs straight away; anything
 * that changes data has `needsApproval`, so the user sees a card and approves
 * it before it runs. Secrets (API keys, mailbox passwords, model settings) are
 * deliberately out of reach.
 */

const uuid = z.string().uuid()
const isoDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD")
const language = z.string().regex(/^[a-z]{2}$/).default("en")
const refresh = () => revalidatePath("/", "layout")

export const assistantTools = {
  // ── Reading ────────────────────────────────────────────────────────────────
  what_needs_attention: tool({
    description: "Replies from companies, overdue or due next steps, documents ready to send, applications with no news, and dated next steps.",
    inputSchema: z.object({}),
    execute: async () => {
      const data = await getDashboard()
      return { attention: data.attention.slice(0, 12), datedSteps: data.events.slice(0, 20), replies: data.replies.slice(0, 8), activeApplications: data.applications, verifiedFacts: data.verifiedFacts }
    },
  }),
  list_applications: tool({
    description: "Applications with stage, fit (0-100), next step and due date. Use sort=fit for best matches. q searches role, company or location.",
    inputSchema: z.object({ show: z.enum(["active", "closed", "archived", "all"]).default("active"), q: z.string().max(200).optional(), sort: z.enum(["fit"]).optional() }),
    execute: async (input) => ({ applications: (await apiApplications(input)).applications.slice(0, 30) }),
  }),
  show_applications: tool({
    description: "Render native application cards for the selected application IDs, in the given order. Use real IDs from previous application lookups.",
    inputSchema: z.object({ ids: z.array(uuid).min(1).max(6) }),
    execute: async ({ ids }) => {
      const { applications } = await apiApplications({ show: "all" })
      const byId = new Map(applications.map((application) => [application.id, application]))
      return { applications: [...new Set(ids)].flatMap((id) => {
        const application = byId.get(id)
        return application ? [application] : []
      }) }
    },
  }),
  get_application: tool({
    description: "One application in detail: stage, fit, evidence counts, next step, emails.",
    inputSchema: z.object({ id: uuid }),
    execute: async ({ id }) => {
      const application = await apiApplication(id)
      return { ...application, emails: application.emails.slice(0, 6).map((email) => ({ ...email, text: email.text.slice(0, 1500) })) }
    },
  }),
  search_jobs: tool({
    description: "Saved job postings by text, with stage and fit.",
    inputSchema: z.object({ q: z.string().max(200).optional(), sort: z.enum(["newest", "oldest", "fit", "company"]).optional() }),
    execute: async (input) => {
      const result = await searchJobs({ q: input.q, sort: input.sort })
      return { total: result.total, jobs: result.jobs.slice(0, 15).map((job) => ({ id: job.id, title: job.title, company: job.company, location: job.location, tags: job.tags, applicationId: job.applicationId ?? null })) }
    },
  }),
  get_job: tool({
    description: "One saved job posting: title, company, location, link and the start of its text.",
    inputSchema: z.object({ id: uuid }),
    execute: async ({ id }) => {
      const job = await getJob(id)
      if (!job) return { error: "Job not found" }
      return { id: job.id, title: job.title, company: job.company?.name ?? null, location: job.location, url: job.sourceUrl || null, text: job.rawText.slice(0, 4000) }
    },
  }),
  list_companies: tool({
    description: "Companies with counts of jobs and applications. q filters by name.",
    inputSchema: z.object({ q: z.string().max(200).optional() }),
    execute: async ({ q }) => ({ companies: (await listCompanies(q)).slice(0, 30).map((company) => ({ id: company.id, name: company.name, website: company.website, jobs: company.jobs, applications: company.applications, active: company.active, researched: company.researched })) }),
  }),
  get_company: tool({
    description: "One company: website, its jobs and applications, and the research brief if any.",
    inputSchema: z.object({ id: uuid }),
    execute: async ({ id }) => {
      const company = await getCompany(id)
      if (!company) return { error: "Company not found" }
      return { id: company.id, name: company.name, website: company.website, research: company.research ? JSON.stringify(company.research).slice(0, 3000) : null, jobs: company.jobs.slice(0, 15) }
    },
  }),
  read_careers_page: tool({
    description: "Read a public company or careers URL supplied by the user. Returns company identity and page text for suggesting role options.",
    inputSchema: z.object({ url: z.string().url().regex(/^https?:\/\//i).max(2000) }),
    execute: async ({ url }) => {
      const domain = registrableDomain(new URL(url).hostname)
      const response = await safeFetch(url, {
        maxBytes: 2 * 1024 * 1024,
        accept: "text/html,application/xhtml+xml",
        timeoutMs: 6000,
      }).catch(() => null)
      if (!response || response.status >= 400 || !/html/i.test(response.contentType)) return { domain, page: null }
      const html = response.buffer.toString("utf8")
      const page = extractPage(html, response.finalUrl)
      return {
        domain,
        page: {
          url: page.url,
          organization: page.organization?.name ?? null,
          title: page.title,
          text: visiblePageText(html).slice(0, 12_000),
        },
      }
    },
  }),
  list_contacts: tool({
    description: "Contacts (recruiters, HR, managers) with role, company and email. q filters.",
    inputSchema: z.object({ q: z.string().max(200).optional() }),
    execute: async ({ q }) => ({ contacts: (await listContacts(q)).slice(0, 30).map((contact) => ({ id: contact.id, name: contact.name, title: contact.title, company: contact.company, email: contact.email || null, linkedinUrl: contact.linkedinUrl || null, applications: contact.applications })) }),
  }),
  read_profile_details: tool({
    description: "Read the user's current name, email, phone, location, availability, and profile links before proposing an edit. Use the exact current value in the proposal.",
    inputSchema: z.object({}),
    execute: async () => {
      const profile = await getProfile()
      if (!profile) return { profile: null }
      return {
        profile: {
          ...Object.fromEntries(profileDetailFields.map((field) => [field, profile[field]])),
          links: profile.links,
        },
      }
    },
  }),
  show_profile: tool({
    description: "Show the user's native profile card with photo, headline, location, and verified entry count. Use for requests to see or open their profile.",
    inputSchema: z.object({}),
    execute: async () => {
      const [profile, entries] = await Promise.all([getProfile(), listEntries()])
      if (!profile) return { profile: null }
      const active = entries.filter((entry) => entry.status !== "archived")
      return {
        profile: {
          name: profile.fullName.trim() || "Your profile",
          headline: profile.headlines.en || profile.headlines.fr || null,
          location: profile.location,
          photoPath: profile.photoPath,
          entries: active.length,
          verified: active.filter((entry) => entry.status === "verified").length,
        },
      }
    },
  }),
  profile_overview: tool({
    description: "The user's profile and experience entries. Includes ndaEntries, the full list of active entries with the profile's NDA badge. Use it for NDA and confidentiality questions.",
    inputSchema: z.object({}),
    execute: async () => {
      const [profile, entries] = await Promise.all([getProfile(), listEntries()])
      if (!profile) return { profile: null }
      return {
        name: profile.fullName, headlines: profile.headlines, location: profile.location,
        ndaEntries: entries.filter((entry) => entry.confidential && entry.status !== "archived").map((entry) => ({
          id: entry.id,
          kind: entry.kind,
          title: entry.title,
          organization: (entry.display.en ?? entry.display.fr)?.organization ?? null,
        })),
        entries: entries.slice(0, 60).map((entry) => ({ id: entry.id, kind: entry.kind, title: entry.title, status: entry.status, confidential: entry.confidential, facts: entry.facts.slice(0, 6).map((fact) => fact.statement) })),
      }
    },
  }),

  find_profile_entries: tool({
    description: "Find active profile entries by organization, title, or role before proposing a profile update.",
    inputSchema: z.object({ q: z.string().trim().min(1).max(160) }),
    execute: async ({ q }) => {
      const term = q.toLowerCase()
      const entries = await entriesForMatching()
      return {
        entries: entries.filter((entry) => [
          entry.title,
          ...Object.values(entry.display).flatMap(({ role, organization }) => [role, organization]),
        ].some((value) => value?.toLowerCase().includes(term))).slice(0, 12).map(({ id, title, kind, display, skills, status }) => ({
          id, title, kind, organization: (display.en ?? display.fr)?.organization, skills, status,
        })),
      }
    },
  }),

  // ── Asking the user ─────────────────────────────────────────────────────────
  ask_user: tool({
    description: "Ask a direct question for missing details or an ambiguous request. Omit options for a free-text answer, or provide up to 5 real choices. The user's answer comes back as choice.",
    inputSchema: z.object({ question: z.string().min(1).max(200), options: z.array(z.string().max(80)).max(5).default([]), allowOther: z.boolean().default(true) }),
    outputSchema: z.object({ choice: z.string() }),
  }),
  open_page: tool({
    description: "Give the user a button to a page in Naruvi.",
    inputSchema: z.object({ path: z.string().regex(/^\/[\w\-/?=&.%]*$/).max(200), label: z.string().max(60) }),
    execute: async (input) => input,
  }),

  // ── Changing things (each one waits for the user's approval) ──────────────
  edit_profile_details: tool({
    description: "Propose a single edit to a profile detail or add, update, or remove a profile link. Read current details first. Requires explicit user approval.",
    inputSchema: profileDetailEdit,
    needsApproval: true,
    execute: async (input) => {
      await editProfileDetails(input)
      refresh()
      return { href: "/profile" }
    },
  }),
  add_profile_fact: tool({
    description: "Propose adding one user-supplied fact and any explicitly mentioned skills to an existing profile entry. Requires user approval.",
    inputSchema: z.object({
      entryId: uuid,
      label: z.string().trim().min(1).max(160),
      statement: z.string().trim().min(3).max(600),
      skills: z.array(z.string().trim().min(1).max(80)).max(8).default([]),
    }),
    needsApproval: true,
    execute: async ({ entryId, statement, skills }) => {
      const result = await mergeIntoEntry(entryId, { facts: [statement], skills }, { approvedByUser: true })
      refresh()
      return { added: result.added, skillsAdded: result.skills, verified: result.verified, href: `/profile/${entryId}` }
    },
  }),
  update_application: tool({
    description: "Change an application: stage, next step, its due date, or archive/restore.",
    inputSchema: z.object({
      id: uuid, label: z.string().max(120).describe("e.g. 'DevOps engineer at Dashlane'"),
      status: z.enum(["submitted", "interviewing", "offer", "rejected", "withdrawn"]).optional(),
      nextStep: z.string().max(200).optional(), nextStepDue: isoDay.optional(), archived: z.boolean().optional(),
    }),
    needsApproval: true,
    execute: async ({ id, status, nextStep, nextStepDue, archived }) => {
      const result = await apiUpdateApplication(id, { status, nextStep, nextStepDue: nextStepDue ? new Date(`${nextStepDue}T09:00:00`).toISOString() : undefined, archived })
      refresh()
      return { updated: true, stage: result.stage, nextStep: result.nextStep, nextStepDue: result.nextStepDue, href: `/applications/${id}` }
    },
  }),
  add_job_from_link: tool({
    description: "Read a job posting from a link (or pasted text) and save it to Applications (as Saved). Checks for duplicates first.",
    inputSchema: z.object({ url: z.string().url().max(2000).optional(), text: z.string().max(60000).optional() }).refine((value) => value.url || (value.text ?? "").length >= 80, "Give a link or the posting text"),
    needsApproval: true,
    execute: async (input) => {
      const draft = await previewJob(input)
      const duplicates = await findDuplicates(draft).catch(() => [])
      if (duplicates.length) return { saved: false, duplicateOf: duplicates.slice(0, 3), note: "Already saved; nothing added." }
      const job = await saveJob(draft)
      await markLeadImported(job.id, [draft.sourceUrl, draft.canonicalUrl])
      await refreshJobInsights(job.id).catch(() => null)
      const applicationId = await trackJob(job.id).catch(() => null)
      scheduleResearch(job.id)
      refresh()
      return { saved: true, jobId: job.id, title: draft.title, company: draft.company, href: applicationId ? `/applications/${applicationId}` : `/jobs/${job.id}` }
    },
  }),
  start_application: tool({
    description: "Analyze the user's fit for a saved job, which creates (or refreshes) its application.",
    inputSchema: z.object({ jobId: uuid, label: z.string().max(120) }),
    needsApproval: true,
    execute: async ({ jobId }) => {
      const application = await analyzeJob(jobId)
      scheduleResearch(jobId)
      refresh()
      const detail = await apiApplication(application.id)
      return { applicationId: application.id, fit: detail.fit, analysis: detail.analysis, href: `/applications/${application.id}` }
    },
  }),
  draft_cv: tool({
    description: "Draft (or redraft) the tailored CV for an application from verified facts.",
    inputSchema: z.object({ applicationId: uuid, label: z.string().max(120), language }),
    needsApproval: true,
    execute: async ({ applicationId, language }) => {
      await generateCv(applicationId, language)
      refresh()
      return { drafted: true, href: `/applications/${applicationId}/cv?lang=${language}` }
    },
  }),
  draft_letter: tool({
    description: "Draft a ready-to-send cover letter for an application. notes: anything the user wants said.",
    inputSchema: z.object({ applicationId: uuid, label: z.string().max(120), language, notes: z.string().max(1500).default("") }),
    needsApproval: true,
    execute: async ({ applicationId, language, notes }) => {
      await generateLetter(applicationId, language, notes)
      refresh()
      return { drafted: true, href: `/applications/${applicationId}/letter?lang=${language}` }
    },
  }),
  research_company: tool({
    description: "Research the company behind a saved job (reads its public website) for a brief used in letters.",
    inputSchema: z.object({ jobId: uuid, label: z.string().max(120) }),
    needsApproval: true,
    execute: async ({ jobId }) => {
      const brief = await researchForJob(jobId, { force: true })
      refresh()
      return brief ? { researched: true, brief: JSON.stringify(brief).slice(0, 2000) } : { researched: false }
    },
  }),
  add_contact: tool({
    description: "Add a contact (or update the same LinkedIn person). Only use details the user gave or tools returned.",
    inputSchema: z.object({ name: z.string().min(1).max(120), title: z.string().max(160).default(""), companyName: z.string().max(160).default(""), email: z.string().max(254).default(""), linkedinUrl: z.string().max(500).default(""), phone: z.string().max(40).default(""), notes: z.string().max(2000).default("") }),
    needsApproval: true,
    execute: async (input) => {
      const id = await saveContact({ ...input, source: "manual" })
      refresh()
      return { contactId: id, href: "/contacts" }
    },
  }),
  update_contact: tool({
    description: "Change a contact's details. Give only the fields to change.",
    inputSchema: z.object({ id: uuid, name: z.string().max(120).optional(), title: z.string().max(160).optional(), companyName: z.string().max(160).optional(), email: z.string().max(254).optional(), linkedinUrl: z.string().max(500).optional(), phone: z.string().max(40).optional(), notes: z.string().max(2000).optional() }),
    needsApproval: true,
    execute: async ({ id, ...changes }) => {
      const current = await getContact(id)
      if (!current) return { error: "Contact not found" }
      await saveContact({ name: current.name, title: current.title, companyName: current.companyName ?? "", email: current.email, linkedinUrl: current.linkedinUrl, phone: current.phone, notes: current.notes, ...Object.fromEntries(Object.entries(changes).filter(([, value]) => value !== undefined)) }, id)
      refresh()
      return { updated: true }
    },
  }),
  delete_contact: tool({
    description: "Delete a contact from Naruvi.",
    inputSchema: z.object({ id: uuid, name: z.string().max(120) }),
    needsApproval: true,
    execute: async ({ id }) => {
      await deleteContact(id)
      refresh()
      return { deleted: true }
    },
  }),
  link_contact: tool({
    description: "Link a contact to an application as a person involved (recruiter, hiring manager, referral…).",
    inputSchema: z.object({ applicationId: uuid, contactId: uuid, role: z.string().max(80).default(""), label: z.string().max(160).describe("e.g. 'Camille Durand → DevOps at Dashlane'") }),
    needsApproval: true,
    execute: async ({ applicationId, contactId, role }) => {
      await linkContact(applicationId, contactId, role)
      refresh()
      return { linked: true, href: `/applications/${applicationId}` }
    },
  }),
  find_contact_email: tool({
    description: "Look up a contact's work email with the email finder (Hunter.io, if set up in Integrations). Sends only their name and the company's domain. If the company has no website yet, the result says so: ask the user for it (or use one they gave), then call again with `website`.",
    inputSchema: z.object({ contactId: uuid, name: z.string().max(120), website: z.string().max(300).optional().describe("The company's own website, e.g. dashlane.com, when it isn't saved yet") }),
    needsApproval: true,
    execute: async ({ contactId, website }) => {
      try {
        const found = await findEmail(contactId, fetch, website)
        refresh()
        return found
      } catch (error) {
        if (error instanceof MissingWebsite) return { needsWebsite: true, company: error.companyName, note: `Ask the user for ${error.companyName}'s website (not LinkedIn), then call again with it.` }
        throw error
      }
    },
  }),
  add_company: tool({
    description: "Add a company on its own (no job needed), from its name and optionally its website. A LinkedIn company link only gives the name; never treat linkedin.com as the website.",
    inputSchema: z.object({ name: z.string().min(1).max(160), website: z.string().max(300).optional() }),
    needsApproval: true,
    execute: async (input) => {
      const company = await saveCompany(input)
      refresh()
      return { companyId: company.id, website: company.website, href: `/companies/${company.id}` }
    },
  }),
  set_company_website: tool({
    description: "Save or correct a company's own website (used for emails, research and its logo).",
    inputSchema: z.object({ companyId: uuid, name: z.string().max(160), website: z.string().max(300) }),
    needsApproval: true,
    execute: async ({ companyId, website }) => {
      const saved = await setCompanyWebsite(companyId, website)
      refresh()
      return { website: saved, href: `/companies/${companyId}` }
    },
  }),
  spontaneous_application: tool({
    description: "Propose creating a spontaneous application. A target role is optional; omit it for an open application.",
    inputSchema: z.object({
      companyName: z.string().min(1).max(160),
      role: z.string().max(160).optional(),
      contactId: uuid.optional(),
      language,
      careersUrl: z.string().url().regex(/^https?:\/\//i).max(2000).optional().describe("The company or careers link supplied by the user."),
      context: z.string().trim().max(1200).optional().describe("Brief sourced company context and, if listed, what the selected role would work on. Omit unverified details."),
    }),
    needsApproval: true,
    execute: async (input) => {
      const { jobId } = await startSpontaneous(input)
      const application = await analyzeJob(jobId)
      if (input.contactId) await linkContact(application.id, input.contactId, "recipient")
      refresh()
      return { applicationId: application.id, href: `/applications/${application.id}` }
    },
  }),
}

export type AssistantTools = typeof assistantTools
