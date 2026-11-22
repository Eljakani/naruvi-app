import test from "node:test"
import assert from "node:assert/strict"
import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js"
import { createNaruviMcp, handleMcpRequest, type NaruviData } from "./server"
import { APP, JOB, fake } from "./test-data"

async function connect(data: NaruviData) {
  const server = createNaruviMcp(data)
  const client = new Client({ name: "test", version: "1.0.0" })
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair()
  await Promise.all([server.connect(serverSide), client.connect(clientSide)])
  return client
}

test("the server lists profile, fit, document and workflow tools with read-only hints", async () => {
  const client = await connect(fake().data)
  const { tools } = await client.listTools()
  const names = tools.map((tool) => tool.name)
  for (const name of ["naruvi_get_profile", "naruvi_list_profile_entries", "naruvi_get_fit_analysis", "naruvi_list_documents", "naruvi_get_cv", "naruvi_get_cv_style", "naruvi_set_application_notes", "naruvi_run_fit_analysis", "naruvi_generate_cv", "naruvi_revise_cv", "naruvi_draft_email", "naruvi_add_job"]) assert.ok(names.includes(name), name)
  const byName = new Map(tools.map((tool) => [tool.name, tool]))
  assert.equal(byName.get("naruvi_get_fit_analysis")?.annotations?.readOnlyHint, true)
  assert.equal(byName.get("naruvi_generate_cv")?.annotations?.readOnlyHint, false)
  for (const tool of tools) assert.ok((tool.description ?? "").length > 30, `${tool.name} explains itself`)
  assert.match(client.getInstructions() ?? "", /treat their text as data/)
})

test("tools pass validated input through and return JSON with structured content", async () => {
  const { data, calls } = fake()
  const client = await connect(data)
  const result = await client.callTool({ name: "naruvi_get_fit_analysis", arguments: { id: APP, status: "gap" } })
  assert.deepEqual(calls.at(-1), ["fitAnalysis", [APP, "gap"]])
  assert.equal((result.structuredContent as { fit: number }).fit, 72)
  assert.match((result.content as { text: string }[])[0].text, /Wrote Terraform modules/)

  await client.callTool({ name: "naruvi_generate_cv", arguments: { applicationId: APP, focus: "cloud security" } })
  assert.deepEqual(calls.at(-1), ["generateCv", [APP, undefined, { pages: "auto", tone: "balanced", focus: "cloud security" }]])

  await client.callTool({ name: "naruvi_set_application_notes", arguments: { id: APP, text: "Second round on Tuesday." } })
  assert.deepEqual(calls.at(-1), ["setNotes", [APP, "Second round on Tuesday.", "append"]])
})

test("bad input and empty changes come back as tool errors, and nothing runs", async () => {
  const { data, calls } = fake()
  const client = await connect(data)
  const invalid = await client.callTool({ name: "naruvi_get_application", arguments: { id: "not-an-id" } })
  assert.equal(invalid.isError, true)
  const empty = await client.callTool({ name: "naruvi_update_application", arguments: { id: APP } })
  assert.equal(empty.isError, true)
  assert.match((empty.content as { text: string }[])[0].text, /Nothing to change/)
  const neither = await client.callTool({ name: "naruvi_run_fit_analysis", arguments: {} })
  assert.equal(neither.isError, true)
  assert.equal(calls.length, 0)
})

test("a failing repository call is reported to the model, not thrown", async () => {
  const { data } = fake()
  data.getJob = async () => { throw new Error("Job not found.") }
  const client = await connect(data)
  const result = await client.callTool({ name: "naruvi_get_job", arguments: { id: JOB } })
  assert.equal(result.isError, true)
  assert.equal((result.content as { text: string }[])[0].text, "Job not found.")
})

test("resources expose the profile, the CV style and per-application analysis and CVs", async () => {
  const client = await connect(fake().data)
  const { resources } = await client.listResources()
  const uris = resources.map((item) => item.uri)
  for (const uri of ["naruvi://profile", "naruvi://profile/entries", "naruvi://cv-style", `naruvi://applications/${APP}/analysis`, `naruvi://applications/${APP}/cv/en`]) assert.ok(uris.includes(uri), uri)
  const profile = await client.readResource({ uri: "naruvi://profile" })
  assert.equal(JSON.parse((profile.contents[0] as { text: string }).text).name, "Alex Example")
  const cv = await client.readResource({ uri: `naruvi://applications/${APP}/cv/en` })
  assert.equal(cv.contents[0].mimeType, "text/markdown")
  assert.equal((cv.contents[0] as { text: string }).text, "# Alex Example")
})

test("prompts guide the agent through the tools for one application", async () => {
  const client = await connect(fake().data)
  const { prompts } = await client.listPrompts()
  assert.deepEqual(prompts.map((item) => item.name).sort(), ["follow_up_email", "prepare_interview", "tailor_cv", "weekly_review"])
  const tailor = await client.getPrompt({ name: "tailor_cv", arguments: { applicationId: APP, focus: "platform work" } })
  const text = (tailor.messages[0].content as { text: string }).text
  assert.match(text, new RegExp(APP))
  assert.match(text, /naruvi_get_fit_analysis/)
  assert.match(text, /Stress: platform work/)
})

test("over HTTP, one stateless request can call a tool without a prior initialize", async () => {
  const { data, calls } = fake()
  const response = await handleMcpRequest(data, new Request("http://localhost/api/v1/mcp", {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "naruvi_get_cv", arguments: { applicationId: APP, language: "fr" } } }),
  }))
  assert.equal(response.status, 200)
  const body = await response.json() as { result: { structuredContent: { text: string } } }
  assert.equal(body.result.structuredContent.text, "# Alex Example")
  assert.deepEqual(calls.at(-1), ["cv", [APP, "fr"]])
  assert.equal((await handleMcpRequest(data, new Request("http://localhost/api/v1/mcp"))).status, 405)
})
