#!/usr/bin/env node
/**
 * Naruvi MCP server for stdio clients (Claude Desktop, Codex, Cursor, Claude Code…).
 * It forwards every message to Naruvi's own MCP endpoint, /api/v1/mcp, so stdio
 * and HTTP clients get the same tools, resources and prompts.
 *
 *   NARUVI_URL      where Naruvi runs (default http://localhost:3000)
 *   NARUVI_API_KEY  a key from Integrations → API & browser extension
 *   NARUVI_MCP_URL  optional: another MCP endpoint that takes the same key, such
 *                   as the Naruvi MCP App (mcp-app/, http://localhost:3200/mcp)
 *
 * Clients that speak Streamable HTTP can skip this script and connect to
 * <NARUVI_URL>/api/v1/mcp with the header `Authorization: Bearer <key>`.
 */
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"

const base = (process.env.NARUVI_URL ?? "http://localhost:3000").replace(/\/+$/, "")
const key = (process.env.NARUVI_API_KEY ?? "").trim()
const endpoint = process.env.NARUVI_MCP_URL?.trim() || `${base}/api/v1/mcp`
/** Fit analysis and CV generation can run for minutes. */
const TIMEOUT_MS = Number(process.env.NARUVI_TIMEOUT_MS ?? 600_000)

const stdio = new StdioServerTransport()
let protocolVersion = null
/** Kept when a server runs stateful sessions (the MCP App does not need one; Naruvi never sets one). */
let sessionId = null

const failure = (id, message) => ({ jsonrpc: "2.0", id, error: { code: -32000, message } })

/** The JSON-RPC messages in a finished server-sent event stream. */
function fromEventStream(text) {
  return text.split(/\r?\n\r?\n/).flatMap((event) => {
    const data = event.split(/\r?\n/).filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trimStart()).join("\n")
    return data ? [JSON.parse(data)] : []
  })
}

async function forward(message) {
  if (!key) throw new Error("Set NARUVI_API_KEY (create a key in Naruvi under Integrations → API & browser extension).")
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      authorization: `Bearer ${key}`,
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      ...(protocolVersion ? { "mcp-protocol-version": protocolVersion } : {}),
      ...(sessionId ? { "mcp-session-id": sessionId } : {}),
    },
    body: JSON.stringify(message),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })
  sessionId = response.headers.get("mcp-session-id") ?? sessionId
  if (response.status === 202) return []
  const text = await response.text()
  let body
  try {
    body = response.headers.get("content-type")?.includes("text/event-stream") ? fromEventStream(text) : text ? JSON.parse(text) : null
  } catch {
    throw new Error(`${endpoint} answered ${response.status} without JSON. Is NARUVI_URL (${base}) right?`)
  }
  if (!response.ok && !body?.jsonrpc && !Array.isArray(body)) throw new Error(body?.error ?? `Naruvi answered ${response.status}.`)
  return Array.isArray(body) ? body : body ? [body] : []
}

stdio.onmessage = async (message) => {
  const id = "id" in message ? message.id : undefined
  try {
    for (const reply of await forward(message)) {
      if (message.method === "initialize" && reply.result?.protocolVersion) protocolVersion = reply.result.protocolVersion
      await stdio.send(reply)
    }
  } catch (error) {
    const text = error instanceof Error ? error.message : String(error)
    // Requests need an answer or the client waits forever; notifications only get logged.
    if (id !== undefined && "method" in message) await stdio.send(failure(id, text))
    else console.error(`[naruvi-mcp] ${text}`)
  }
}
stdio.onerror = (error) => console.error(`[naruvi-mcp] ${error.message}`)
stdio.onclose = () => process.exit(0)

await stdio.start()
