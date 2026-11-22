import { existsSync, readFileSync } from "node:fs"

/**
 * Serves each view as one self-contained page (built by scripts/inline-views.mjs)
 * instead of Skybridge's page, which loads its scripts from this server's URL.
 *
 * Why: a host renders the view in its own sandbox. With a local server (Claude
 * Desktop through mcp/naruvi-mcp.mjs) the sandbox cannot load scripts from
 * http://localhost:3200, and Skybridge then also asks for `ui.domain:
 * "http://localhost:3200"`, which is not a sandbox domain a host accepts. The
 * inline page needs no network, so the domain and CSP entries are dropped too.
 */

const VIEW_URI = /^ui:\/\/(?:views|widgets)\/(?:ext-apps|apps-sdk)\/([\w-]+)\.html/

/** The inline page of each view; `enabled` is false when none were built (for example in `skybridge dev`). */
export type InlineViews = { enabled: boolean; page(view: string): string | undefined }

/** Reads dist/inline/<view>.html next to the running server, once per view. */
export function inlineViewsFrom(dir: URL): InlineViews {
  const cache = new Map<string, string | undefined>()
  return {
    enabled: existsSync(dir),
    page(view) {
      if (!/^[\w-]+$/.test(view)) return undefined
      if (!cache.has(view)) {
        const file = new URL(`${view}.html`, dir)
        cache.set(view, existsSync(file) ? readFileSync(file, "utf8") : undefined)
      }
      return cache.get(view)
    },
  }
}

type Json = unknown

/** Drops `domain` and `csp` from every `ui` metadata object. */
function stripUiNetwork(value: Json): void {
  if (Array.isArray(value)) return value.forEach(stripUiNetwork)
  if (!value || typeof value !== "object") return
  const record = value as Record<string, Json>
  if (record.ui && typeof record.ui === "object" && !Array.isArray(record.ui)) {
    const ui = record.ui as Record<string, Json>
    delete ui.domain
    delete ui.csp
  }
  for (const child of Object.values(record)) stripUiNetwork(child)
}

/**
 * Rewrites one JSON-RPC message: view pages become their inline version and
 * view metadata stops asking for network access. Returns the message unchanged
 * when no inline pages were built.
 */
export function rewriteMessage(message: Json, inline: InlineViews): Json {
  const result = (message as { result?: Record<string, Json> } | null)?.result
  if (!inline.enabled || !result || typeof result !== "object") return message
  const contents = Array.isArray(result.contents) ? (result.contents as Record<string, Json>[]) : []
  for (const content of contents) {
    const view = typeof content.uri === "string" ? content.uri.match(VIEW_URI)?.[1] : undefined
    const html = view ? inline.page(view) : undefined
    if (html) content.text = html
  }
  stripUiNetwork(result)
  return message
}

/** Rewrites a complete server-sent event (`event: …\ndata: {…}`); other text passes through. */
export function rewriteEvent(event: string, inline: InlineViews): string {
  return event.replace(/^data: (.*)$/m, (line, data: string) => {
    try {
      return `data: ${JSON.stringify(rewriteMessage(JSON.parse(data), inline))}`
    } catch {
      return line
    }
  })
}

type Res = {
  write(chunk: unknown, ...rest: unknown[]): boolean
  end(chunk?: unknown, ...rest: unknown[]): unknown
  setHeader(name: string, value: unknown): unknown
  getHeader(name: string): unknown
  removeHeader(name: string): void
  headersSent: boolean
}

const text = (chunk: unknown) => (typeof chunk === "string" ? chunk : Buffer.isBuffer(chunk) ? chunk.toString("utf8") : chunk instanceof Uint8Array ? Buffer.from(chunk).toString("utf8") : "")

/** Express middleware: rewrites the MCP responses (event stream or JSON) as they are written. */
export function inlineViewsMiddleware(inline: InlineViews) {
  return (_req: unknown, res: Res, next: () => void) => {
    const write = res.write.bind(res)
    const end = res.end.bind(res)
    const setHeader = res.setHeader.bind(res)
    let pending = ""
    // Lengths change when pages are swapped in.
    res.setHeader = (name: string, value: unknown) => (name.toLowerCase() === "content-length" ? res : setHeader(name, value))
    const isStream = () => String(res.getHeader("content-type") ?? "").includes("text/event-stream")
    const flush = (final: boolean) => {
      if (isStream()) {
        const events = pending.split("\n\n")
        pending = events.pop() ?? ""
        let out = events.map((event) => `${rewriteEvent(event, inline)}\n\n`).join("")
        if (final && pending) out += rewriteEvent(pending, inline)
        if (final) pending = ""
        return out
      }
      if (!final) return ""
      const body = pending
      pending = ""
      try {
        return JSON.stringify(rewriteMessage(JSON.parse(body), inline))
      } catch {
        return body
      }
    }
    res.write = (chunk: unknown) => {
      pending += text(chunk)
      const out = flush(false)
      return out ? write(out) : true
    }
    res.end = (chunk?: unknown, ...rest: unknown[]) => {
      if (chunk !== undefined && typeof chunk !== "function") pending += text(chunk)
      if (!res.headersSent) res.removeHeader("content-length")
      const out = flush(true)
      return end(out, ...rest.filter((value) => typeof value === "function"))
    }
    next()
  }
}
