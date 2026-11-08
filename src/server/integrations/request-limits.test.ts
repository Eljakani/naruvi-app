import test from "node:test"
import assert from "node:assert/strict"
import { API_BODY_BYTES, boundedApiRequest, RequestLimitError } from "./request-limits"

test("API request limits accept normal JSON and reject oversized chunked bodies", async () => {
  const normal = await boundedApiRequest(new Request("https://example.com", { method: "POST", headers: { "content-type": "application/json" }, body: '{"name":"test"}' }))
  assert.deepEqual(await normal.json(), { name: "test" })
  const request = new Request("https://example.com", { method: "POST", headers: { "content-type": "application/json" }, body: new ReadableStream({ start(c) { c.enqueue(new Uint8Array(API_BODY_BYTES)); c.enqueue(new Uint8Array(1)); c.close() } }), duplex: "half" } as RequestInit)
  await assert.rejects(boundedApiRequest(request), e => e instanceof RequestLimitError && e.status === 413)
})
test("API bodies reject compression and unsupported content types", async () => {
  await assert.rejects(boundedApiRequest(new Request("https://example.com", { method: "POST", body: "bad" })), e => e instanceof RequestLimitError && e.status === 415)
  await assert.rejects(boundedApiRequest(new Request("https://example.com", { method: "POST", headers: { "content-type": "application/json", "content-encoding": "gzip" }, body: "bad" })), e => e instanceof RequestLimitError && e.status === 415)
})
