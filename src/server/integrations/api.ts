import "server-only"
import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto"
import { eq } from "drizzle-orm"
import { z } from "zod"
import { db } from "@/server/db/client"
import { settings } from "@/server/db/schema"

const KEY = "integration.api"
const entry = z.object({ id: z.string(), name: z.string(), hash: z.string(), prefix: z.string(), createdAt: z.string(), lastUsedAt: z.string().nullable() })
const stored = z.object({ tokens: z.array(entry).default([]) })
type Entry = z.infer<typeof entry>

const sha256 = (value: string) => createHash("sha256").update(value).digest("hex")

async function read() {
  const row = await db.query.settings.findFirst({ where: eq(settings.key, KEY) })
  return stored.safeParse(row?.value ?? {}).data ?? { tokens: [] }
}
async function write(tokens: Entry[]) {
  const value = { tokens }
  await db.insert(settings).values({ key: KEY, value }).onConflictDoUpdate({ target: settings.key, set: { value } })
}

/** Keys without their hashes, for the settings card. */
export async function listApiKeys() {
  return (await read()).tokens.map((token) => ({ id: token.id, name: token.name, prefix: token.prefix, createdAt: token.createdAt, lastUsedAt: token.lastUsedAt }))
}

/** A new key, returned once. Only its SHA-256 is stored. */
export async function createApiKey(name: string) {
  const token = `nrv_${randomBytes(24).toString("hex")}`
  const { tokens } = await read()
  if (tokens.length >= 20) throw new Error("You have 20 keys. Revoke one first.")
  tokens.push({ id: randomUUID(), name: name.trim().slice(0, 60) || "API key", hash: sha256(token), prefix: token.slice(0, 8), createdAt: new Date().toISOString(), lastUsedAt: null })
  await write(tokens)
  return token
}

export async function revokeApiKey(id: string) {
  const { tokens } = await read()
  await write(tokens.filter((token) => token.id !== id))
}

/** Checks `Authorization: Bearer nrv_…`; records when the key was last used (at most once a minute). */
export async function authenticate(request: Request) {
  const header = request.headers.get("authorization") ?? ""
  const token = header.match(/^Bearer\s+(nrv_[a-f0-9]{48})$/)?.[1]
  if (!token) return null
  const hash = Buffer.from(sha256(token))
  const { tokens } = await read()
  const match = tokens.find((item) => timingSafeEqual(Buffer.from(item.hash), hash))
  if (!match) return null
  if (!match.lastUsedAt || Date.now() - Date.parse(match.lastUsedAt) > 60_000) {
    match.lastUsedAt = new Date().toISOString()
    await write(tokens).catch(() => {})
  }
  return match
}

/** Wrap a route handler: 401 without a valid key, JSON errors, no caching. */
export function api<T extends unknown[]>(handler: (request: Request, ...rest: T) => Promise<unknown>) {
  return async (request: Request, ...rest: T) => {
    if (!(await authenticate(request))) return Response.json({ error: "Missing or invalid API key. Create one on the Integrations page." }, { status: 401, headers: { "cache-control": "no-store" } })
    try {
      const body = await handler(request, ...rest)
      if (body instanceof Response) return body
      return Response.json(body, { headers: { "cache-control": "no-store" } })
    } catch (error) {
      if (error instanceof z.ZodError) return Response.json({ error: "Invalid request.", issues: error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`) }, { status: 400 })
      if (error instanceof NotFound) return Response.json({ error: error.message }, { status: 404 })
      console.error("[api]", error)
      return Response.json({ error: "Something went wrong." }, { status: 500 })
    }
  }
}

export class NotFound extends Error {}
