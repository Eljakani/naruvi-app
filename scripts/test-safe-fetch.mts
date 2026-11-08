/** Socket options are intercepted: no requests are sent to private or external services. */
import assert from "node:assert/strict"
import dns from "node:dns/promises"
import http from "node:http"
import { EventEmitter } from "node:events"
import { PassThrough } from "node:stream"
import { syncBuiltinESMExports } from "node:module"
import { gzipSync } from "node:zlib"
let lookups = 0
let requests = 0
let redirect = false
const originalLookup = dns.lookup
const originalRequest = http.request
// A second DNS resolution would be private. The actual socket lookup must never use it.
dns.lookup = (async () => [{ address: ++lookups === 1 ? "93.184.216.34" : "127.0.0.1", family: 4 }]) as unknown as typeof dns.lookup
http.request = ((url: URL, options: http.RequestOptions) => {
  requests++
  assert.equal(url.hostname, "attacker.example")
  assert.equal(options.agent, false)
  const lookup = options.lookup as (...args: unknown[]) => void
  lookup("attacker.example", {}, (error: Error | null, address: string) => { assert.equal(error, null); assert.equal(address, "93.184.216.34") })
  const result = new EventEmitter() as EventEmitter & { end: () => void; destroy: () => void }
  result.end = () => {
    const response = new PassThrough() as PassThrough & { statusCode: number; headers: Record<string, string> }
    response.statusCode = redirect ? 302 : 200
    response.headers = redirect ? { location: "http://attacker.example/private" } : { "content-type": "text/plain", "content-encoding": "gzip" }
    queueMicrotask(() => { result.emit("response", response); response.end(redirect ? "" : gzipSync("hello")) })
  }
  result.destroy = () => {}
  return result
}) as unknown as typeof http.request
syncBuiltinESMExports()
try {
  const { safeFetch } = await import("../src/server/assets/safe-fetch")
  const result = await safeFetch("http://attacker.example/", { maxBytes: 100, accept: "text/plain" })
  assert.equal(result.buffer.toString(), "hello")
  assert.equal(lookups, 1)
  assert.equal(requests, 1)
  lookups = requests = 0
  redirect = true
  await assert.rejects(safeFetch("http://attacker.example/", { maxBytes: 100, accept: "text/plain" }), /private|reserved/)
  assert.equal(requests, 1)
  lookups = requests = 0
  redirect = false
  await assert.rejects(safeFetch("http://attacker.example/", { maxBytes: 2, accept: "text/plain" }), /too large/)
  console.log("Pinned fetch passed: single DNS resolution, pinned lookup, redirect rebinding block and decompressed size cap.")
} finally { dns.lookup = originalLookup; http.request = originalRequest; syncBuiltinESMExports() }
