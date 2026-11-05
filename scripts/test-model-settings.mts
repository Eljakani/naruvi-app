/** Integration test against a disposable schema; never writes the app's settings. */
import assert from "node:assert/strict"
import { randomBytes } from "node:crypto"
import { createServer } from "node:http"
import { config } from "dotenv"
import postgres from "postgres"

config({ path: ".env.local", quiet: true })
const originalUrl = process.env.DATABASE_URL
if (!originalUrl) throw new Error("DATABASE_URL is required.")
const schema = `naruvi_settings_test_${randomBytes(8).toString("hex")}`
const control = postgres(originalUrl, { max: 1, onnotice: () => {} })
const scopedUrl = new URL(originalUrl)
scopedUrl.searchParams.set("search_path", schema)
process.env.DATABASE_URL = scopedUrl.href
process.env.SETTINGS_ENCRYPTION_KEY = randomBytes(32).toString("hex")
process.env.LLM_API_KEY = ""
let authorization: string | undefined
let runningObserved = false
let failProvider = false
const provider = createServer(async (request, response) => {
  authorization = request.headers.authorization
  const chunks = []
  for await (const chunk of request) chunks.push(chunk)
  const body = JSON.parse(Buffer.concat(chunks).toString())
  const [active] = await control.unsafe(`SELECT count(*)::int AS n FROM ${schema}.run_steps WHERE status = 'running'`)
  runningObserved ||= active.n > 0
  if (failProvider) { response.writeHead(401, {"content-type":"application/json"}); response.end(JSON.stringify({error: {message: authorization}})); return }
  response.setHeader("content-type", "application/json")
  response.end(JSON.stringify({ id: "fixture-request", choices: [{ message: { content: JSON.stringify({ model: body.model }) }, finish_reason: "stop" }], usage: {prompt_tokens: 42, completion_tokens: 7} }))
})

try {
  await control.unsafe(`CREATE SCHEMA ${schema}`)
  await control.unsafe(`CREATE TABLE ${schema}.settings (key text PRIMARY KEY, value jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now())`)
  await control.unsafe(`CREATE TABLE ${schema}.runs (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workflow text NOT NULL, application_id uuid, status text NOT NULL, idempotency_key text NOT NULL, input jsonb NOT NULL DEFAULT '{}', output jsonb, error text, started_at timestamptz, finished_at timestamptz, created_at timestamptz DEFAULT now())`)
  await control.unsafe(`CREATE TABLE ${schema}.run_steps (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), run_id uuid NOT NULL, name text NOT NULL, status text NOT NULL, model text, prompt_version text, input_tokens integer, output_tokens integer, cost_usd real, latency_ms integer, detail text NOT NULL DEFAULT '', output jsonb, error text, created_at timestamptz DEFAULT now())`)
  await new Promise<void>((resolve) => provider.listen(0, "127.0.0.1", resolve))
  const address = provider.address()
  if (!address || typeof address === "string") throw new Error("Could not start the fixture provider.")
  const { getLlmConfiguration, getLlmOverview, saveLlmSettings } = await import("../src/server/settings/llm")
  const { completeJson, completionForRun } = await import("../src/server/llm/client")
  const { startRun } = await import("../src/server/runs/tracer")
  const baseUrl = `http://127.0.0.1:${address.port}/v1`
  const secret = "test-only-not-a-real-provider-key"
  const saved = await saveLlmSettings({ baseUrl, model: "fixture-model", apiKey: secret })
  assert.equal(saved.hasKey, true)
  assert.equal(saved.keySource, "database")
  assert.ok(!JSON.stringify(saved).includes(secret))
  assert.ok(!("encryptedApiKey" in saved))
  const [row] = await control.unsafe(`SELECT value FROM ${schema}.settings WHERE key = 'language-model'`)
  assert.ok(!JSON.stringify(row.value).includes(secret))
  assert.match(row.value.encryptedApiKey, /^v1\./)
  assert.equal((await getLlmConfiguration()).apiKey, secret)
  await completeJson({ system: "test", user: "test" })
  assert.equal(authorization, `Bearer ${secret}`)
  await saveLlmSettings({ baseUrl, model: "updated-model", apiKey: "" })
  const updated = await completeJson({ system: "test", user: "test" })
  assert.equal(JSON.parse(updated.text).model, "updated-model")
  assert.equal(authorization, `Bearer ${secret}`)
  await saveLlmSettings({ baseUrl, model: "updated-model", apiKey: "replacement-test-key" })
  await completeJson({ system: "test", user: "test" })
  assert.equal(authorization, "Bearer replacement-test-key")
  const run = await startRun("fixture.sdk", {fixture: true})
  const traced = completionForRun(run, "fixture request", "fixture-v1")
  await traced({system: "Return JSON.", user: "test"})
  assert.equal(runningObserved, true)
  const [step] = await control.unsafe(`SELECT * FROM ${schema}.run_steps WHERE run_id = '${run.id}'`)
  assert.equal(step.status, "succeeded")
  assert.equal(step.model, "updated-model")
  assert.equal(step.input_tokens, 42)
  assert.equal(step.output_tokens, 7)
  assert.equal(step.prompt_version, "fixture-v1")
  failProvider = true
  await assert.rejects(() => traced({system: "Return JSON.", user: "test"}), /HTTP 401/)
  const [failed] = await control.unsafe(`SELECT * FROM ${schema}.run_steps WHERE run_id = '${run.id}' AND status = 'failed'`)
  assert.ok(failed)
  assert.ok(!failed.error.includes("replacement-test-key"))
  await run.finish("succeeded")
  await saveLlmSettings({ baseUrl: "https://provider.example/v1", model: "updated-model", apiKey: "", removeKey: true })
  assert.equal((await getLlmOverview()).hasKey, false)
  assert.equal((await getLlmConfiguration()).configured, false)
  console.log("Passed: encrypted storage, safe UI status, decryption at use, live model/key updates, explicit removal, SDK usage metrics, running/failed request traces, and error redaction.")
} finally {
  provider.closeAllConnections()
  await new Promise<void>((resolve) => provider.close(() => resolve()))
  await control.unsafe(`DROP SCHEMA IF EXISTS ${schema} CASCADE`)
  await control.end()
  // The application module owns a development connection pool; stop only this test process.
}
process.exit(0)
