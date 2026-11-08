import { sameOrigin } from "./policy"
import { rateLimit, acquireWorkLease } from "./store"
import { boundedApiRequest, RequestLimitError } from "@/server/integrations/request-limits"

const active = new Map<string, number>()

export async function workBudget(request: Request, scope: "assistant" | "pdf-preview") {
  if (!sameOrigin(request)) return { response: Response.json({ error: "Forbidden" }, { status: 403 }) }
  const limit = await rateLimit(`work:${scope}`, scope === "assistant" ? 12 : 30, 60)
  if (!limit.allowed) return { response: Response.json({ error: "Too many requests. Please try again shortly." }, { status: 429, headers: { "retry-after": String(limit.retry), "cache-control": "no-store" } }) }
  if ((active.get(scope) || 0) >= 2) return { response: Response.json({ error: "Naruvi is busy." }, { status: 429, headers: { "retry-after": "5" } }) }
  active.set(scope, (active.get(scope) || 0) + 1)
  let lease: Awaited<ReturnType<typeof acquireWorkLease>>
  try { lease = await acquireWorkLease(scope, 2, 240) }
  catch (error) { active.set(scope, active.get(scope)! - 1); throw error }
  if (!lease) active.set(scope, active.get(scope)! - 1)
  let released = false
  const release = lease ? async () => { if (!released) { released = true; active.set(scope, active.get(scope)! - 1); await lease!() } } : null
  if (!release) return { response: Response.json({ error: "Naruvi is busy. Please try again shortly." }, { status: 429, headers: { "retry-after": "5", "cache-control": "no-store" } }) }
  try {
    const bounded = await boundedApiRequest(request, scope === "assistant" ? 16 * 1024 * 1024 : 64 * 1024)
    return { request: bounded, release }
  } catch (error) {
    await release().catch(() => {})
    if (error instanceof RequestLimitError) return { response: Response.json({ error: error.message }, { status: error.status, headers: { "cache-control": "no-store" } }) }
    throw error
  }
}
/** Hold admission for the stream lifetime, releasing on completion, error or disconnect. */
export function budgetedStream(response: Response, release: () => Promise<void>, abort: AbortController) {
  const reader = response.body?.getReader()
  let released = false
  const finish = async () => { if (!released) { released = true; abort.abort(); await release().catch(() => {}) } }
  if (!reader) { void finish(); return response }
  const body = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const chunk = await reader.read()
        if (chunk.done) { controller.close(); await finish() }
        else controller.enqueue(chunk.value)
      } catch (error) { controller.error(error); await finish() }
    },
    async cancel() { abort.abort(); try { await reader.cancel() } finally { await finish() } },
  })
  return new Response(body, { status: response.status, headers: response.headers })
}
