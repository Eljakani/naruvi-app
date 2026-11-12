import "server-only"
import { revalidatePath } from "next/cache"
import { tool } from "ai"
import { z } from "zod"
import { analyzeJob, trackJob } from "@/server/applications/repository"
import { safeFetch } from "@/server/assets/safe-fetch"
import { getCompany, listCompanies, findDuplicates , saveCompany, setCompanyWebsite, setJobTags } from "@/server/companies/repository"
import { MissingWebsite, deleteContact, findEmail, getContact, linkContact, listContacts, saveContact, startSpontaneous, unlinkContact } from "@/server/contacts/repository"
import { generateCv, generateLetter, reviseSavedCv } from "@/server/documents/service"
import { apiApplication, apiApplications, apiUpdateApplication } from "@/server/integrations/api-data"
import { getJob, previewJob, saveJob } from "@/server/jobs/ingest"
import { refreshJobInsights } from "@/server/jobs/insights"
import { dismissLead, markLeadImported, newLeads } from "@/server/jobs/leads"
import { searchJobs } from "@/server/jobs/search"
import { registrableDomain } from "@/server/jobs/vendor/company-resolver"
import { changeEntryStatus, changeFact, createEntryFromFields, editProfileDetails, entriesForMatching, getEntry, removeEntry, removeSkills, saveGoals, saveImportedProfile, setEntryGuards, getProfile, listEntries, mergeIntoEntry, updateEntryFields } from "@/server/profile/repository"
import { entryName, fieldGuide } from "@/lib/entry-fields"
import { profileDetailEdit, profileDetailFields } from "@/server/profile/schemas"
import { getDashboard } from "@/server/queries/dashboard"
import { extractPage, visiblePageText } from "@/server/research/extract"
import { researchForJob } from "@/server/research/service"
import { scheduleResearch } from "@/server/research/auto"
import { composeContext, draftApplicationMail } from "@/server/mail/send"
import { syncMail } from "@/server/mail/sync"
import { salaryContext } from "@/server/salary/market"
import { importProfileText, IMPORT_PROMPT_VERSION } from "@/server/profile/ai-import"
import { completionForRun } from "@/server/llm/client"
import { startRun } from "@/server/runs/tracer"
import { searchGoal } from "@/lib/search-goals"

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
      return { ...application, emails: application.emails.slice(-8).map((email) => ({ ...email, text: email.text.slice(0, 1500) })) }
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
        ndaEntries: entries.filter((entry) => entry.confidential && entry.status !== "archived").map((entry) => ({ id: entry.id, kind: entry.kind, name: entryName(entry) })),
        entries: entries.slice(0, 60).map((entry) => ({ id: entry.id, kind: entry.kind, name: entryName(entry), text: entry.display, fields: entry.fields, status: entry.status, confidential: entry.confidential, facts: entry.facts.slice(0, 6).map((fact) => fact.statement) })),
      }
    },
  }),

  find_profile_entries: tool({
    description: "Find active profile entries by any of their fields (company, position, project name, school, issuer…) before proposing a profile update.",
    inputSchema: z.object({ q: z.string().trim().min(1).max(160) }),
    execute: async ({ q }) => {
      const term = q.toLowerCase()
      const entries = await entriesForMatching()
      return {
        entries: entries.filter((entry) => [
          ...Object.values(entry.display).flatMap((text) => Object.values(text)),
          ...Object.values(entry.fields).filter((value): value is string => typeof value === "string"),
        ].some((value) => value.toLowerCase().includes(term))).slice(0, 12).map(({ id, kind, display, fields, skills, status }) => ({
          id, kind, name: entryName({ kind, display, fields }), text: display, fields, skills, status,
        })),
      }
    },
  }),

  // ── Asking the user ─────────────────────────────────────────────────────────
  get_profile_entry: tool({
    description: "One profile entry in full: fields, facts WITH their ids, skills, NDA flag (confidential), do-not-claim rules and status. Read it before editing or removing a fact, skill or rule.",
    inputSchema: z.object({ entryId: uuid }),
    execute: async ({ entryId }) => {
      const entry = await getEntry(entryId)
      if (!entry) return { error: "Entry not found" }
      return { id: entry.id, kind: entry.kind, name: entryName(entry), status: entry.status, text: entry.display, fields: entry.fields, confidential: entry.confidential, doNotClaim: entry.doNotClaim, skills: entry.skills, facts: entry.facts.map((fact) => ({ id: fact.id, statement: fact.statement })), href: `/profile/${entry.id}` }
    },
  }),
  read_search_goals: tool({
    description: "The user's job search goals (target roles, contracts, places, work modes, work authorization, duration, start month). Read before proposing a goal change.",
    inputSchema: z.object({}),
    execute: async () => ({ goals: (await getProfile())?.goals ?? [] }),
  }),
  list_job_leads: tool({
    description: "New job leads waiting for triage: postings from job alert emails, job discovery and pages saved with the browser extension. To save one, use add_job_from_link with its url.",
    inputSchema: z.object({ limit: z.number().int().min(1).max(50).default(20) }),
    execute: async ({ limit }) => ({ leads: (await newLeads(limit)).map((lead) => ({ id: lead.id, title: lead.title, company: lead.company || null, location: lead.location || null, board: lead.board, source: lead.source, url: lead.url, foundAt: lead.foundAt })) }),
  }),
  salary_for_job: tool({
    description: "Salary context for a saved job: the posting's own range, similar saved postings and market data when configured, with links. Use it for salary or negotiation questions.",
    inputSchema: z.object({ jobId: uuid }),
    execute: async ({ jobId }) => {
      const job = await getJob(jobId)
      if (!job) return { error: "Job not found" }
      const context = await salaryContext({ id: job.id, title: job.title, location: job.location, salary: job.salary, language: job.language, company: job.company })
      return { job: { title: job.title, company: job.company?.name ?? null, location: job.location }, ...context }
    },
  }),
  check_mail: tool({
    description: "Fetch new mail from the connected inbox now (waits for a sync already running), then report. Use before answering whether a company replied.",
    inputSchema: z.object({}),
    execute: async () => {
      const result = await syncMail({ rescan: true, wait: true })
      refresh()
      return result.skipped ? { checked: 0, note: result.skipped } : { checked: result.checked, newMessagesLinked: result.stored, newLeads: result.leads ?? 0 }
    },
  }),
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
  draft_email: tool({
    description: "Write an editable EMAIL draft: reply to a recruiter/interview invitation, follow up, thank someone, or send an application email. This is NOT a cover letter. Uses the selected application's actual email thread. Does not send email, change application documents, or require approval. The user reviews the draft in the email composer and explicitly sends it there. Resolve the application first; a company named by the user overrides any earlier company in the conversation.",
    inputSchema: z.object({ applicationId: uuid, kind: z.enum(["reply", "follow_up", "thank_you", "apply"]).default("reply"), replyTo: uuid.nullable().default(null), instructions: z.string().max(4000), language: z.enum(["auto", "en", "fr", "de", "es", "ar"]).default("auto") }),
    execute: async ({ applicationId, kind, replyTo, instructions, language }) => {
      const context = await composeContext(applicationId, kind, replyTo)
      if (!context) throw new Error("Application not found.")
      const draft = await draftApplicationMail({ applicationId, kind, replyTo: context.replyTo, instructions, language, tone: "professional", subject: context.subject, body: "", attachCv: false, attachLetter: false })
      return { ...draft, applicationId, kind, replyTo: context.replyTo, instructions, language, company: context.application.company, to: context.to, canSend: context.canSend }
    },
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
  edit_profile_entry: tool({
    description: `Propose changing the fields of one existing profile entry (e.g. a project's name or tagline, a job's company or dates). Each kind has its own fields; use only these:\n${fieldGuide()}\nPer-language fields go in text with the CV language (en or fr); shared fields go in fields. An empty string clears a field. Read the entry first. Requires user approval.`,
    inputSchema: z.object({
      entryId: uuid,
      label: z.string().trim().min(1).max(160).describe("What changes, in a few words, for the approval card."),
      language: z.enum(["en", "fr"]).default("en"),
      text: z.record(z.string(), z.string().max(200)).default({}),
      fields: z.record(z.string(), z.union([z.string().max(2048), z.object({ start: z.string().optional(), end: z.string().optional() })])).default({}),
    }),
    needsApproval: true,
    execute: async ({ entryId, language, text, fields }) => {
      const entry = await updateEntryFields(entryId, { language, text, fields })
      refresh()
      return { name: entryName(entry, language), text: entry.display, fields: entry.fields, href: `/profile/${entryId}` }
    },
  }),
  create_profile_entry: tool({
    description: `Propose adding a NEW profile entry (a job, internship, education, project, certification, skill group, language, achievement…) when no existing entry matches. Search with find_profile_entries first; if one matches, use edit_profile_entry or add_profile_fact instead. Each kind has its own fields; use only these:\n${fieldGuide()}\nPer-language fields go in text with the CV language (en or fr); shared fields (company, dates…) go in fields. facts: atomic statements the user supplied (from their message, a screenshot or a document), one claim each, never invented. Requires user approval.`,
    inputSchema: z.object({
      kind: z.enum(["experience", "education", "project", "skill", "certification", "language", "achievement", "other"]),
      label: z.string().trim().min(1).max(160).describe("What is being added, e.g. \"Cloud & Infrastructure Intern at Acme\", for the approval card."),
      language: z.enum(["en", "fr"]).default("en"),
      text: z.record(z.string(), z.string().max(200)).default({}),
      fields: z.record(z.string(), z.union([z.string().max(2048), z.object({ start: z.string().optional(), end: z.string().optional() })])).default({}),
      facts: z.array(z.string().trim().min(3).max(600)).max(30).default([]),
      skills: z.array(z.string().trim().min(1).max(80)).max(30).default([]),
    }),
    needsApproval: true,
    execute: async ({ kind, language, text, fields, facts, skills }) => {
      const entry = await createEntryFromFields({ kind, language, text, fields, facts, skills })
      refresh()
      return { id: entry.id, name: entryName(entry, language), facts: facts.length, skills: skills.length, href: `/profile/${entry.id}` }
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
  set_entry_status: tool({
    description: "Propose verifying a profile entry (its facts can then support CVs and letters), sending it back to review, archiving it (hidden, kept) or restoring it (status verified). Verify only after the user confirms the entry is accurate. Requires approval.",
    inputSchema: z.object({ entryId: uuid, label: z.string().trim().min(1).max(160), status: z.enum(["verified", "needs_review", "archived"]) }),
    needsApproval: true,
    execute: async ({ entryId, status }) => {
      const result = await changeEntryStatus(entryId, status)
      refresh()
      return { ...result, href: `/profile/${entryId}` }
    },
  }),
  delete_profile_entry: tool({
    description: "Propose permanently deleting a profile entry with its facts. Prefer set_entry_status archived unless the user clearly wants it gone. Requires approval.",
    inputSchema: z.object({ entryId: uuid, label: z.string().trim().min(1).max(160) }),
    needsApproval: true,
    execute: async ({ entryId }) => {
      const result = await removeEntry(entryId)
      refresh()
      return { deleted: true, ...result, href: "/profile" }
    },
  }),
  edit_profile_fact: tool({
    description: "Propose rewording one fact of a profile entry, or removing it (statement empty). Read the entry with get_profile_entry for the fact id. Use only what the user said. Requires approval.",
    inputSchema: z.object({ entryId: uuid, factId: uuid, label: z.string().trim().min(1).max(160), statement: z.string().trim().max(600).describe("The new wording; empty removes the fact.") }),
    needsApproval: true,
    execute: async ({ entryId, factId, statement }) => {
      if (statement && statement.length < 3) throw new Error("A fact needs at least a few words.")
      const result = await changeFact(entryId, factId, statement || null)
      refresh()
      return { ...result, removed: !statement, href: `/profile/${entryId}` }
    },
  }),
  remove_entry_skills: tool({
    description: "Propose removing skills from a profile entry. Requires approval.",
    inputSchema: z.object({ entryId: uuid, label: z.string().trim().min(1).max(160), skills: z.array(z.string().trim().min(1).max(80)).min(1).max(30) }),
    needsApproval: true,
    execute: async ({ entryId, skills }) => {
      const result = await removeSkills(entryId, skills)
      refresh()
      return { ...result, href: `/profile/${entryId}` }
    },
  }),
  set_entry_guards: tool({
    description: "Propose marking a profile entry as NDA/confidential (documents stay high-level about it) or not, and adding or removing do-not-claim rules (e.g. \"Do not claim team lead\"). Requires approval.",
    inputSchema: z.object({ entryId: uuid, label: z.string().trim().min(1).max(160), confidential: z.boolean().optional(), addRules: z.array(z.string().trim().min(3).max(200)).max(10).default([]), removeRules: z.array(z.string().trim().min(1).max(200)).max(10).default([]) }),
    needsApproval: true,
    execute: async ({ entryId, confidential, addRules, removeRules }) => {
      const result = await setEntryGuards(entryId, { confidential, addRules, removeRules })
      refresh()
      return { ...result, href: `/profile/${entryId}` }
    },
  }),
  save_search_goal: tool({
    description: "Propose adding or changing one job search goal, or removing it (remove: true). Read read_search_goals first and send the WHOLE goal (keep its id to change it; omit id for a new goal). contracts use the app's contract keys. Requires approval.",
    inputSchema: z.object({ label: z.string().trim().min(1).max(160), goal: searchGoal.partial({ id: true }), remove: z.boolean().default(false) }),
    needsApproval: true,
    execute: async ({ goal, remove }) => {
      const goals = (await getProfile())?.goals ?? []
      const id = goal.id ?? `goal-${crypto.randomUUID().slice(0, 8)}`
      const next = remove ? goals.filter((item) => item.id !== id) : goals.some((item) => item.id === id) ? goals.map((item) => (item.id === id ? { ...goal, id } : item)) : [...goals, { ...goal, id }]
      await saveGoals(next)
      refresh()
      return { goals: next.length, href: "/profile" }
    },
  }),
  import_profile_text: tool({
    description: "Propose importing a CV, LinkedIn export or career notes the user pasted or attached (pass its full text): creates new profile entries with facts and skills, skipping ones already in the profile. New entries need review. For a single experience prefer create_profile_entry. Requires approval.",
    inputSchema: z.object({ label: z.string().trim().min(1).max(160), text: z.string().trim().min(80).max(60_000) }),
    needsApproval: true,
    execute: async ({ text }) => {
      const run = await startRun("profile.import", { via: "assistant", length: text.length })
      try {
        const result = await run.step("structure CV", () => importProfileText(text, completionForRun(run, "profile import", IMPORT_PROMPT_VERSION)), (value) => `${value.entries.length} entries`)
        const saved = await saveImportedProfile({ language: result.language, identity: result.identity, entries: result.entries }, { dedupe: true, status: "needs_review" })
        await run.finish("succeeded")
        refresh()
        return { ...saved, href: "/profile" }
      } catch (error) {
        await run.finish("failed", undefined, error instanceof Error ? error.message : String(error))
        throw error
      }
    },
  }),
  dismiss_job_leads: tool({
    description: "Propose dismissing job leads the user doesn't want (ids from list_job_leads). Requires approval.",
    inputSchema: z.object({ label: z.string().trim().min(1).max(160), leadIds: z.array(uuid).min(1).max(50) }),
    needsApproval: true,
    execute: async ({ leadIds }) => {
      for (const id of leadIds) await dismissLead(id)
      refresh()
      return { dismissed: leadIds.length, href: "/jobs" }
    },
  }),
  tag_job: tool({
    description: "Propose setting the tags of a saved job (send the full list; read get_job or search_jobs for current tags). Requires approval.",
    inputSchema: z.object({ jobId: uuid, label: z.string().trim().min(1).max(160), tags: z.array(z.string().trim().min(1).max(40)).max(20) }),
    needsApproval: true,
    execute: async ({ jobId, tags }) => {
      await setJobTags(jobId, [...new Set(tags)])
      refresh()
      return { tags, href: `/jobs/${jobId}` }
    },
  }),
  revise_cv: tool({
    description: "Change an application's existing CV from a request (\"shorter\", \"lead with security\", \"drop the hackathon\"), checked against verified facts, and save it as a new revision. For a fresh CV use draft_cv. Requires approval.",
    inputSchema: z.object({ applicationId: uuid, label: z.string().trim().min(1).max(160), language, request: z.string().trim().min(2).max(600) }),
    needsApproval: true,
    execute: async ({ applicationId, language, request }) => {
      const result = await reviseSavedCv(applicationId, language, request)
      refresh()
      return { ...result, href: `/applications/${applicationId}/cv?lang=${language}` }
    },
  }),
  unlink_contact: tool({
    description: "Propose removing a contact from an application (the contact itself is kept). Requires approval.",
    inputSchema: z.object({ applicationId: uuid, contactId: uuid, label: z.string().trim().min(1).max(160) }),
    needsApproval: true,
    execute: async ({ applicationId, contactId }) => {
      await unlinkContact(applicationId, contactId)
      refresh()
      return { unlinked: true, href: `/applications/${applicationId}` }
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
    description: "Generate the formal COVER LETTER document attached to a job application. Only for an explicit cover-letter request. NEVER use for emails, replies, interview availability, follow-ups, thank-you emails or messages to a recruiter/CEO. Use draft_email for those. notes: cover-letter instructions only.",
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
