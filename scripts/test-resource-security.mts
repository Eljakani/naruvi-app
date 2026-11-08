import assert from "node:assert/strict"
import { randomBytes } from "node:crypto"
import { config } from "dotenv"
import postgres from "postgres"
import sharp from "sharp"
config({ path: ".env.local", quiet: true })
const original = process.env.DATABASE_URL!
const control = postgres(original, { max: 1, onnotice: () => {} })
const schema = `resource_test_${randomBytes(8).toString("hex")}`
const url = new URL(original)
url.searchParams.set("search_path", schema)
process.env.DATABASE_URL = url.href
process.env.NARUVI_URL = "http://localhost:3000"
try {
  await control.unsafe(`CREATE SCHEMA ${schema}`)
  const auth = await import("../src/server/auth/store")
  const { workBudget, budgetedStream } = await import("../src/server/auth/work-budget")
  const { trimLogo } = await import("../src/server/assets/normalize")
  await auth.initializeAuth()
  const admitted = await Promise.all(Array.from({ length: 6 }, () => auth.acquireWorkLease("fixture", 2, 30)))
  assert.equal(admitted.filter(Boolean).length, 2)
  await Promise.all(admitted.filter(Boolean).map(release => release!()))
  const request = (body = "{}") => new Request("http://localhost:3000/api/templates/preview", { method: "POST", headers: { origin: "http://localhost:3000", "content-type": "application/json" }, body })
  const oversized = await workBudget(request("a".repeat(65537)), "pdf-preview")
  assert.equal(oversized.response?.status, 413)
  const one = await workBudget(request(), "pdf-preview")
  const two = await workBudget(request(), "pdf-preview")
  assert.ok(one.release && two.release)
  assert.equal((await workBudget(request(), "pdf-preview")).response?.status, 429)
  await one.release!()
  const replacement = await workBudget(request(), "pdf-preview")
  assert.ok(replacement.release)
  await two.release!(); await replacement.release!()
  let released = 0
  const abort = new AbortController()
  const streamed = budgetedStream(new Response("fixture"), async () => { released++ }, abort)
  assert.equal(await streamed.text(), "fixture")
  assert.equal(released, 1)
  const cancelled = budgetedStream(new Response(new ReadableStream()), async () => { released++ }, new AbortController())
  await cancelled.body!.cancel()
  assert.equal(released, 2)
  const bomb = Buffer.alloc(24)
  Buffer.from([137,80,78,71,13,10,26,10]).copy(bomb)
  bomb.writeUInt32BE(10000, 16); bomb.writeUInt32BE(10000, 20)
  assert.equal(await trimLogo(bomb), null)
  const normal = await sharp({ create: { width: 1200, height: 400, channels: 4, background: "#a95832" } }).png().toBuffer()
  const logo = await trimLogo(normal)
  assert.ok(logo && logo.width <= 512 && logo.height <= 512)
  console.log("Resource tests passed: cross-process admission, body caps, stream release/cancel, pixel rejection and safe downsampling.")
} catch (error) { console.error(error); process.exitCode = 1 }
finally { await control.unsafe(`DROP SCHEMA IF EXISTS ${schema} CASCADE`); await control.end(); process.exit(process.exitCode || 0) }
