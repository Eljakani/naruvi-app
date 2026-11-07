"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"
import { saveCompany, setCompanyWebsite } from "@/server/companies/repository"

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
