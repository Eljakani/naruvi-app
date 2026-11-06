import { z } from "zod"
import { api } from "@/server/integrations/api"
import { listContacts, saveContact } from "@/server/contacts/repository"

/** GET /api/v1/contacts?q=… */
export const GET = api(async (request: Request) => {
  const q = new URL(request.url).searchParams.get("q") ?? undefined
  const rows = await listContacts(q?.slice(0, 200))
  return { contacts: rows.map(({ id, name, title, company, email, linkedinUrl, applications }) => ({ id, name, title, company, email, linkedinUrl, applications })) }
})

const body = z.object({ name: z.string().trim().min(1).max(120), title: z.string().max(160).default(""), companyName: z.string().max(160).default(""), linkedinUrl: z.string().max(500).default(""), email: z.string().max(254).default("") })

/** The browser extension saves a LinkedIn profile here; the same profile again updates it. */
export const POST = api(async (request: Request) => {
  const input = body.parse(await request.json())
  const linkedinUrl = input.linkedinUrl.replace(/[?#].*$/, "").replace(/\/$/, "")
  const id = await saveContact({ ...input, linkedinUrl, source: "extension" })
  return { id, open: `${new URL(request.url).origin}/contacts?q=${encodeURIComponent(input.name)}` }
})
