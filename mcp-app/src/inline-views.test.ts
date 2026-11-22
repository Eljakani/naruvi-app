import assert from "node:assert/strict"
import { test } from "node:test"
import { inlineViewsMiddleware, rewriteEvent, rewriteMessage, type InlineViews } from "./inline-views.js"

const pages: InlineViews = { enabled: true, page: (view) => (view === "applications" ? "<div id=root></div><script type=module>/*inline*/</script>" : undefined) }
const none: InlineViews = { enabled: false, page: () => undefined }
const meta = () => ({ ui: { description: "Application board", prefersBorder: true, domain: "http://localhost:3200", csp: { resourceDomains: ["http://localhost:3200"] } } })
const read = () => ({ jsonrpc: "2.0", id: 3, result: { contents: [{ uri: "ui://views/ext-apps/applications.html?v=1f018cdf", mimeType: "text/html;profile=mcp-app", text: '<script src="http://localhost:3200/a.js"></script>', _meta: meta() }] } })

test("a view page is swapped for its inline version and stops asking for network access", () => {
  const message = rewriteMessage(read(), pages) as ReturnType<typeof read>
  const content = message.result.contents[0]
  assert.match(content.text, /inline/)
  assert.deepEqual(content._meta, { ui: { description: "Application board", prefersBorder: true } })
})

test("resource lists lose domain and CSP; other messages pass unchanged", () => {
  const list = rewriteMessage({ jsonrpc: "2.0", id: 2, result: { resources: [{ uri: "ui://views/ext-apps/cv.html", _meta: meta() }] } }, pages) as { result: { resources: { _meta: unknown }[] } }
  assert.deepEqual(list.result.resources[0]._meta, { ui: { description: "Application board", prefersBorder: true } })
  const call = { jsonrpc: "2.0", id: 4, result: { structuredContent: { applications: [] }, content: [] } }
  assert.deepEqual(rewriteMessage(structuredClone(call), pages), call)
})

test("nothing changes when no inline pages were built", () => {
  assert.deepEqual(rewriteMessage(read(), none), read())
})

test("event-stream text: only the data line is rewritten", () => {
  const event = rewriteEvent(`event: message\ndata: ${JSON.stringify(read())}`, pages)
  assert.match(event, /^event: message\ndata: /)
  assert.match(event, /inline/)
  assert.doesNotMatch(event, /localhost:3200/)
})

test("the middleware rewrites a stream written in pieces", () => {
  const written: string[] = []
  const headers = new Map<string, unknown>([["content-type", "text/event-stream"]])
  const res = {
    headersSent: false,
    write: (chunk: unknown) => (written.push(String(chunk)), true),
    end: (chunk?: unknown) => (chunk ? written.push(String(chunk)) : 0),
    setHeader: (name: string, value: unknown) => headers.set(name.toLowerCase(), value),
    getHeader: (name: string) => headers.get(name.toLowerCase()),
    removeHeader: (name: string) => void headers.delete(name.toLowerCase()),
  }
  inlineViewsMiddleware(pages)({}, res, () => {})
  const body = `event: message\ndata: ${JSON.stringify(read())}\n\n`
  res.setHeader("Content-Length", "999")
  res.write(body.slice(0, 40))
  res.write(body.slice(40))
  res.end()
  assert.equal(headers.has("content-length"), false)
  const out = written.join("")
  assert.match(out, /inline/)
  assert.doesNotMatch(out, /localhost:3200/)
  assert.ok(out.endsWith("\n\n"))
})
