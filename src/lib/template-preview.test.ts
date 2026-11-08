import test from "node:test"
import assert from "node:assert/strict"
import { fetchTemplatePreview } from "./template-preview"

const pdf = () => new Response("%PDF-test", { headers: { "content-type": "application/pdf", "x-pages": "2" } })
const signal = () => new AbortController().signal

test("previews run two at a time and cancelled queued requests never fetch", async (t) => {
  const finish: (() => void)[] = []
  const calls: string[] = []
  t.mock.method(globalThis, "fetch", async (_url: string, init: RequestInit) => {
    calls.push(init.body as string)
    await new Promise<void>((resolve) => finish.push(resolve))
    return pdf()
  })
  const first = fetchTemplatePreview("first", signal())
  const second = fetchTemplatePreview("second", signal())
  const cancelled = new AbortController()
  const third = fetchTemplatePreview("cancelled", cancelled.signal)
  const fourth = fetchTemplatePreview("fourth", signal())
  const rejection = assert.rejects(third, { name: "AbortError" })
  cancelled.abort()
  await rejection
  assert.deepEqual(calls, ["first", "second"])
  finish.shift()!()
  const result = await first
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(result.pages, 2)
  assert.equal(new TextDecoder().decode(result.data), "%PDF-test")
  assert.deepEqual(calls, ["first", "second", "fourth"])
  finish.splice(0).forEach((resolve) => resolve())
  await Promise.all([second, fourth])
})

test("busy previews respect Retry-After then succeed", async (t) => {
  let calls = 0
  const started = Date.now()
  t.mock.method(globalThis, "fetch", async () => ++calls === 1
    ? new Response("busy", { status: 429, headers: { "retry-after": "1" } }) : pdf())
  await fetchTemplatePreview("retry", signal())
  assert.equal(calls, 2)
  assert.ok(Date.now() - started >= 1000)
})

test("repeated busy responses stop after two retries", async (t) => {
  let calls = 0
  t.mock.method(globalThis, "fetch", async () => {
    calls += 1
    return new Response("busy", { status: 429, headers: { "retry-after": "0" } })
  })
  await assert.rejects(fetchTemplatePreview("busy", signal()), /429/)
  assert.equal(calls, 3)
})

test("aborting a retry wait cancels it and releases admission", async (t) => {
  const controller = new AbortController()
  let calls = 0
  t.mock.method(globalThis, "fetch", async () => {
    calls += 1
    return new Response("busy", { status: 429, headers: { "retry-after": "60" } })
  })
  const request = fetchTemplatePreview("abort", controller.signal)
  const rejection = assert.rejects(request, { name: "AbortError" })
  await new Promise((resolve) => setTimeout(resolve, 10))
  controller.abort()
  await rejection
  assert.equal(calls, 1)
})

test("permanent failures do not retry or block later previews", async (t) => {
  let calls = 0
  t.mock.method(globalThis, "fetch", async () => {
    calls += 1
    return calls <= 2 ? new Response("invalid", { status: 422 }) : pdf()
  })
  const failed = await Promise.allSettled([
    fetchTemplatePreview("invalid1", signal()), fetchTemplatePreview("invalid2", signal()),
  ])
  assert.ok(failed.every((result) => result.status === "rejected"))
  await Promise.all([fetchTemplatePreview("ok1", signal()), fetchTemplatePreview("ok2", signal())])
  assert.equal(calls, 4)
})
