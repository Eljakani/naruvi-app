import test from "node:test"
import assert from "node:assert/strict"
import { createServer, type Server } from "node:http"
import type { AddressInfo } from "node:net"
import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js"
import { handleMcpRequest } from "./server"
import { APP, fake } from "./test-data"

const KEY = `nrv_${"ab".repeat(24)}`

/** A stand-in for Naruvi's /api/v1/mcp route: same handler, a fixed key instead of the key store. */
async function naruvi({ path = "/api/v1/mcp", stream = false } = {}) {
  const { data, calls } = fake()
  const seen: string[] = []
  const server: Server = createServer(async (incoming, outgoing) => {
    seen.push(`${incoming.method} ${incoming.url}`)
    const chunks: Buffer[] = []
    for await (const chunk of incoming) chunks.push(chunk as Buffer)
    let response: Response
    if (incoming.url !== path) response = new Response("not found", { status: 404 })
    else if (incoming.headers.authorization !== `Bearer ${KEY}`) response = Response.json({ error: "Missing or invalid API key. Create one on the Integrations page." }, { status: 401 })
    else {
      const headers = new Headers(Object.entries(incoming.headers).flatMap(([name, value]) => (typeof value === "string" ? [[name, value] as [string, string]] : [])))
      response = await handleMcpRequest(data, new Request(`http://localhost${incoming.url}`, { method: incoming.method, headers, body: chunks.length ? Buffer.concat(chunks) : undefined }))
    }
    // An MCP App (Skybridge) answers as a server-sent event stream instead of plain JSON.
    if (stream && response.headers.get("content-type")?.includes("application/json") && response.status === 200) {
      outgoing.writeHead(200, { "content-type": "text/event-stream" })
      return outgoing.end(`event: message\ndata: ${await response.text()}\n\n`)
    }
    outgoing.writeHead(response.status, Object.fromEntries(response.headers))
    outgoing.end(Buffer.from(await response.arrayBuffer()))
  })
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
  return { url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, calls, seen, close: () => new Promise((resolve) => server.close(resolve)) }
}

function bridge(url: string, key: string, mcpUrl?: string) {
  return new StdioClientTransport({ command: process.execPath, args: ["mcp/naruvi-mcp.mjs"], env: { PATH: process.env.PATH ?? "", NARUVI_URL: url, NARUVI_API_KEY: key, ...(mcpUrl ? { NARUVI_MCP_URL: mcpUrl } : {}) }, stderr: "pipe" })
}

test("the stdio script forwards tools, resources and prompts to Naruvi's HTTP endpoint with the key", async () => {
  const server = await naruvi()
  const client = new Client({ name: "test", version: "1.0.0" })
  try {
    await client.connect(bridge(server.url, KEY))
    assert.equal(client.getServerVersion()?.name, "naruvi")
    assert.ok((await client.listTools()).tools.some((tool) => tool.name === "naruvi_get_fit_analysis"))
    const result = await client.callTool({ name: "naruvi_generate_cv", arguments: { applicationId: APP, pages: "1" } })
    assert.notEqual(result.isError, true)
    assert.deepEqual(server.calls.at(-1), ["generateCv", [APP, undefined, { pages: "1", tone: "balanced", focus: "" }]])
    const style = await client.readResource({ uri: "naruvi://cv-style" })
    assert.equal(JSON.parse((style.contents[0] as { text: string }).text).template, "atlas")
    assert.equal((await client.listPrompts()).prompts.length, 4)
    assert.ok(server.seen.every((line) => line === "POST /api/v1/mcp"))
  } finally {
    await client.close()
    await server.close()
  }
})

test("a wrong key is reported to the client instead of hanging", async () => {
  const server = await naruvi()
  const client = new Client({ name: "test", version: "1.0.0" })
  try {
    await assert.rejects(client.connect(bridge(server.url, `nrv_${"cd".repeat(24)}`)), /invalid API key/)
  } finally {
    await client.close()
    await server.close()
  }
})

test("NARUVI_MCP_URL points the script at an MCP App that answers as an event stream", async () => {
  const server = await naruvi({ path: "/mcp", stream: true })
  const client = new Client({ name: "test", version: "1.0.0" })
  try {
    await client.connect(bridge("http://127.0.0.1:9", KEY, `${server.url}/mcp`))
    const result = await client.callTool({ name: "naruvi_get_fit_analysis", arguments: { id: APP } })
    assert.equal((result.structuredContent as { fit: number }).fit, 72)
  } finally {
    await client.close()
    await server.close()
  }
})
