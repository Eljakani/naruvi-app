/** Uses disposable settings/auth tables; never changes the real API keys. */
import assert from "node:assert/strict"
import { randomBytes } from "node:crypto"
import { config } from "dotenv"
import postgres from "postgres"
config({ path: ".env.local", quiet: true })
const original = process.env.DATABASE_URL!
const control = postgres(original, { max: 1, onnotice: () => {} })
const observer = postgres(original, { max: 1, onnotice: () => {} })
const schema = `api_test_${randomBytes(8).toString("hex")}`
const url = new URL(original)
url.searchParams.set("search_path", schema)
url.searchParams.set("application_name", schema)
process.env.DATABASE_URL = url.href
try {
  await control.unsafe(`CREATE SCHEMA ${schema}`)
  await control.unsafe(`CREATE TABLE ${schema}.settings (key text PRIMARY KEY,value jsonb NOT NULL,updated_at timestamptz NOT NULL DEFAULT now())`)
  const keys = await import("../src/server/integrations/api")
  const auth = await import("../src/server/auth/store")
  await auth.initializeAuth()
  const created = await Promise.all(Array.from({ length: 5 }, (_, i) => keys.createApiKey(`key ${i}`)))
  assert.equal((await keys.listApiKeys()).length, 5)
  const request = (key: string) => new Request("http://localhost:3000/api/v1/me", { headers: { authorization: `Bearer ${key}` } })
  const id = (await keys.listApiKeys()).find(k => k.name === "key 0")!.id
  // Usage updates contend on the same row as revoke; no stale list may resurrect it.
  await Promise.all([keys.revokeApiKey(id), ...Array.from({ length: 12 }, () => keys.authenticate(request(created[0])))])
  assert.equal(await keys.authenticate(request(created[0])), null)
  assert.equal((await keys.listApiKeys()).length, 4)
  const raceKey = await keys.createApiKey("deterministic race")
  const raceId = (await keys.listApiKeys()).find(k => k.name === "deterministic race")!.id
  let inFlight: Promise<unknown> | undefined
  await control.begin(async tx => {
    // Uncommitted revocation is invisible to authenticate's initial SELECT.
    await tx.unsafe(`UPDATE ${schema}.settings SET value=jsonb_set(value,'{tokens}', (SELECT jsonb_agg(item) FROM jsonb_array_elements(value->'tokens') item WHERE item->>'id'<>$1)) WHERE key='integration.api'`, [raceId])
    inFlight = keys.authenticate(request(raceKey))
    let waiting = false
    for (let attempt = 0; attempt < 100; attempt++) {
      const rows = await observer`SELECT count(*)::int AS n FROM pg_stat_activity WHERE application_name=${schema} AND wait_event_type='Lock'`
      if (rows[0].n) { waiting = true; break }
      await new Promise(resolve => setTimeout(resolve, 20))
    }
    assert.ok(waiting, "usage update must be blocked behind uncommitted revocation")
  })
  assert.equal(await inFlight, null)
  assert.equal(await keys.authenticate(request(raceKey)), null)
  assert.equal((await keys.listApiKeys()).length, 4)
  const handler = keys.api(async r => ({ ok: true, ...(r.method === "POST" ? await r.json() : {}) }))
  assert.equal((await handler(request(created[1]))).status, 200)
  const oversized = new Request("http://localhost:3000/api/v1/me", { method: "POST", headers: { authorization: `Bearer ${created[1]}`, "content-type": "application/json" }, body: "a".repeat(512*1024+1) })
  assert.equal((await handler(oversized)).status, 413)
  for (let i = 0; i < 60; i++) await auth.rateLimit("api:client:untrusted", 60, 60)
  const throttled = await handler(request(created[1]))
  assert.equal(throttled.status, 429)
  assert.ok(Number(throttled.headers.get("retry-after")) > 0)
  console.log("API security passed: concurrent create/revoke/usage, body limits and throttling.")
} catch (error) { console.error(error); process.exitCode = 1 }
finally { await control.unsafe(`DROP SCHEMA IF EXISTS ${schema} CASCADE`); await control.end(); await observer.end(); process.exit(process.exitCode || 0) }
