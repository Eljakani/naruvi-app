import "server-only"
import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto"
import { rateLimit } from "@/server/auth/store"
import { clientBucket } from "@/server/auth/policy"
import { boundedApiRequest, RequestLimitError } from "./request-limits"
import { eq, sql } from "drizzle-orm"
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
/** Serialize every mutation of the legacy JSON key list on its settings row. */
async function mutate<T>(change: (tokens: Entry[]) => T) {
  return db.transaction(async tx => {
    await tx.insert(settings).values({ key: KEY, value: { tokens: [] } }).onConflictDoNothing()
    const [row] = await tx.select().from(settings).where(eq(settings.key, KEY)).for("update")
    const tokens = stored.parse(row.value).tokens
    const result = change(tokens)
    await tx.update(settings).set({ value: { tokens } }).where(eq(settings.key, KEY))
    return result
  })
}

/** Keys without their hashes, for the settings card. */
export async function listApiKeys() {
  return (await read()).tokens.map((token) => ({ id: token.id, name: token.name, prefix: token.prefix, createdAt: token.createdAt, lastUsedAt: token.lastUsedAt }))
}

/** A new key, returned once. Only its SHA-256 is stored. */
export async function createApiKey(name: string) {
  const token = `nrv_${randomBytes(24).toString("hex")}`
  await mutate(tokens => {
    if (tokens.length >= 20) throw new Error("You have 20 keys. Revoke one first.")
    tokens.push({ id: randomUUID(), name: name.trim().slice(0, 60) || "API key", hash: sha256(token), prefix: token.slice(0, 8), createdAt: new Date().toISOString(), lastUsedAt: null })
  })
  return token
}

export async function revokeApiKey(id: string) {
  await mutate(tokens => { const index = tokens.findIndex(token => token.id === id); if (index >= 0) tokens.splice(index, 1) })
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
    // Update only an entry which still exists in the current row; never write the stale snapshot.
    const result = await db.execute(sql`UPDATE settings SET value=jsonb_set(value,'{tokens}',
      (SELECT coalesce(jsonb_agg(CASE WHEN item->>'id'=${match.id} THEN item || jsonb_build_object('lastUsedAt',${new Date().toISOString()}::text) ELSE item END),'[]'::jsonb)
       FROM jsonb_array_elements(value->'tokens') AS item))
      WHERE key=${KEY} AND EXISTS (SELECT 1 FROM jsonb_array_elements(value->'tokens') AS item WHERE item->>'id'=${match.id}) RETURNING key`)
    if (!result.length) return null
  }
  return match
}

/** Wrap a route handler: 401 without a valid key, JSON errors, no caching. */
export function api<T extends unknown[]>(handler: (request: Request, ...rest: T) => Promise<unknown>) {
  return async (request: Request, ...rest: T) => {
    const throttled = (retry: number) => Response.json({ error: "API rate limit exceeded." }, { status: 429, headers: { "cache-control": "no-store", "retry-after": String(retry) } })
    try {
      const client = await rateLimit(`api:client:${clientBucket(request)}`, 60, 60)
      if (!client.allowed) return throttled(client.retry)
      const global = await rateLimit("api:global", 300, 60)
      if (!global.allowed) return throttled(global.retry)
    } catch { return Response.json({ error: "API temporarily unavailable." }, { status: 503, headers: { "cache-control": "no-store" } }) }
    let authed: Awaited<ReturnType<typeof authenticate>>
    try { authed = await authenticate(request) } catch { authed = null }
    if (!authed) return Response.json({ error: "Missing or invalid API key. Create one on the Integrations page." }, { status: 401, headers: { "cache-control": "no-store" } })
    try {
      const budget = await rateLimit(`api:key:${authed.id}`, 120, 60)
      if (!budget.allowed) return throttled(budget.retry)
      const body = await handler(await boundedApiRequest(request), ...rest)
      if (body instanceof Response) return body
      return Response.json(body, { headers: { "cache-control": "no-store" } })
    } catch (error) {
      if (error instanceof RequestLimitError) return Response.json({ error: error.message }, { status: error.status, headers: { "cache-control": "no-store" } })
      if (error instanceof SyntaxError) return Response.json({ error: "Invalid JSON body." }, { status: 400, headers: { "cache-control": "no-store" } })
      if (error instanceof z.ZodError) return Response.json({ error: "Invalid request.", issues: error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`) }, { status: 400 })
      if (error instanceof NotFound) return Response.json({ error: error.message }, { status: 404 })
      console.error("[api]", error)
      return Response.json({ error: "Something went wrong." }, { status: 500 })
    }
  }
}

export class NotFound extends Error {}
