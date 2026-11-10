"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"
import { saveCompany, setCompanyWebsite } from "@/server/companies/repository"
import { serverError } from "@/i18n/server-errors"

type Result<T> = { ok: true; data: T } | { ok: false; message: string }
const fail = (error: unknown): { ok: false; message: string } => ({ ok: false, message: error instanceof z.ZodError ? (error.issues[0]?.message ?? "Check the details.") : error instanceof Error ? error.message : String(error) })

export async function addCompanyAction(input: { name: string; website?: string }): Promise<Result<{ id: string }>> {
  try {
    const parsed = z.object({ name: z.string().trim().min(1, "Enter the company’s name").max(160), website: z.string().trim().max(500).optional() }).parse(input)
    const company = await saveCompany(parsed)
    revalidatePath("/companies")
    revalidatePath("/contacts")
    return { ok: true, data: { id: company.id } }
  } catch (error) {
    return fail(error)
  }
}

export async function setCompanyWebsiteAction(id: string, website: string): Promise<Result<{ website: string }>> {
  try {
    const saved = await setCompanyWebsite(z.string().uuid().parse(id), z.string().trim().min(1, "Enter the website").max(500).parse(website))
    revalidatePath("/companies", "layout")
    revalidatePath("/contacts")
    return { ok: true, data: { website: saved } }
  } catch (error) {
    return fail(error)
  }
}

export async function refreshCompanyProfileAction(id: string): Promise<Result<{ found: number }>> {
  if (!z.string().uuid().safeParse(id).success) return { ok: false, message: await serverError("invalidCompany") }
  try {
    const { refreshCompanyProfile } = await import("@/server/companies/profile")
    const profile = await refreshCompanyProfile(id)
    if (!profile) return { ok: false, message: await serverError("wikidataAndTheBusiness") }
    revalidatePath(`/companies/${id}`)
    return { ok: true, data: { found: profile.facts.length } }
  } catch (error) {
    return fail(error)
  }
}

export async function researchCompanyAction(id: string): Promise<Result<{ sources: number; items: number }>> {
  try {
    const companyId = z.string().uuid().parse(id)
    const { researchForCompany } = await import("@/server/research/service")
    const brief = await researchForCompany(companyId, { force: true })
    if (!brief) return { ok: false, message: await serverError("companyNotFound") }
    revalidatePath("/companies", "layout")
    return { ok: true, data: { sources: brief.sources.length, items: (brief.summary ? 1 : 0) + brief.about.length + brief.mission.length + brief.values.length + brief.facts.length } }
  } catch (error) {
    return fail(error)
  }
}

/** Watch (url given), check now (no url) or stop watching (url null) a company's public job board. */
export async function careersAction(id: string, url?: string | null): Promise<Result<{ added: number }>> {
  if (!z.string().uuid().safeParse(id).success) return { ok: false, message: await serverError("invalidCompany") }
  try {
    const careers = await import("@/server/jobs/careers")
    let added = 0
    if (url === null) await careers.unwatchCareers(id)
    else added = url ? await careers.watchCareers(id, z.string().trim().url("Paste the full careers page link (https://…).").max(500).parse(url)) : await careers.checkCareers(id)
    revalidatePath(`/companies/${id}`)
    revalidatePath("/jobs")
    return { ok: true, data: { added } }
  } catch (error) {
    return fail(error)
  }
}
