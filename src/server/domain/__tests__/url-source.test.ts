import assert from "node:assert/strict"
import test from "node:test"
import { needsBrowser, parseFromUrl, type TextResponse } from "../../jobs/url-source"

const url = "https://careers.example.com/jobs/engineer"
const description = "Build reliable services, review code, and work with customers on production systems. ".repeat(12)
function posting(text = description) {
  return `<html><head><script type="application/ld+json">${JSON.stringify({ "@type": "JobPosting", title: "Software Engineer", hiringOrganization: { name: "Example" }, description: text })}</script></head><body><noscript>Enable JavaScript</noscript></body></html>`
}
const response = (text: string): TextResponse => ({ text, finalUrl: url, status: 200, contentType: "text/html" })

test("complete HTTP posting does not launch a browser, even with a noscript notice", async () => {
  const result = await parseFromUrl(url, {
    fetchText: async () => response(posting()),
    renderPage: async () => { throw new Error("must not run") },
  })
  assert.equal(needsBrowser(result.job), false)
  assert.equal(result.errors.length, 0)
  assert.equal(result.job.source, "json-ld")
})

test("JS shell is replaced by the rendered job and its page metadata", async () => {
  let calls = 0
  const rendered = { html: posting(), finalUrl: `${url}?rendered=1` }
  const result = await parseFromUrl(url, {
    fetchText: async () => response("<title>Loading</title><body>Please enable JavaScript</body>"),
    renderPage: async () => { calls += 1; return rendered },
  })
  assert.equal(calls, 1)
  assert.equal(result.job.source, "browser:json-ld")
  assert.equal(result.job.role, "Software Engineer")
  assert.equal(result.page, rendered)
})

test("HTTP failures still get a browser attempt", async () => {
  const result = await parseFromUrl(url, {
    fetchText: async () => ({ ...response("Forbidden"), status: 403 }),
    renderPage: async () => ({ html: posting(), finalUrl: url }),
  })
  assert.equal(result.job.description, description.trim())
  assert.match(result.errors[0], /403/)
})

test("a shorter or failed browser result never replaces useful HTTP content", async () => {
  const teaser = description.slice(0, 350)
  for (const fail of [false, true]) {
    const result = await parseFromUrl(url, {
      fetchText: async () => response(posting(teaser)),
      renderPage: async () => {
        if (fail) throw new Error("Chromium is not installed")
        return { html: "<title>Access denied</title><body>Access denied " + "blocked ".repeat(300) + "</body>", finalUrl: url }
      },
    })
    assert.equal(result.job.description, teaser.trim())
    assert.equal(result.job.source, "json-ld")
    assert.ok(result.job.warnings.some((warning) => /browser|Chromium/i.test(warning)))
  }
})

test("unreadable content reports a paste-text recovery instead of importing a wall", async () => {
  await assert.rejects(() => parseFromUrl(url, {
    fetchText: async () => response("<title>Just a moment</title><body>Checking your browser " + "wait ".repeat(300) + "</body>"),
    renderPage: async () => { throw new Error("Timed out") },
  }), /Paste the job text instead/)
})

test("a complete ATS response avoids Chromium even if the public page fails", async () => {
  const result = await parseFromUrl("https://jobs.lever.co/example/123", {
    fetchText: async (candidate) => {
      if (!candidate.includes("api.lever.co")) throw new Error("Page blocked")
      return { ...response(JSON.stringify({ text: "Software Engineer", description, categories: { team: "Engineering", location: "Paris" } })), contentType: "application/json" }
    },
    renderPage: async () => { throw new Error("must not run") },
  })
  assert.equal(needsBrowser(result.job), false)
  assert.ok(!result.errors.some((error) => /must not run/.test(error)))
})
