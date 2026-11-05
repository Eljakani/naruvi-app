/** Real Chromium integration, served entirely through the injected HTTP transport. */
import assert from "node:assert/strict"
import test from "node:test"
import { renderJobPage } from "../src/server/jobs/browser"
import { parseSource } from "../src/server/jobs/select"
import type { safeFetch } from "../src/server/assets/safe-fetch"

const origin = "https://93.184.216.34"
const description = "Build and maintain reliable applications with our engineering team. ".repeat(15)

test("Chromium loads delayed JavaScript and JSON while blocking private and write requests", async () => {
  const requests: string[] = []
  const fetchResource: typeof safeFetch = async (url) => {
    requests.push(url)
    const path = new URL(url).pathname
    const text = path === "/job"
      ? '<html><head><title>Loading</title></head><body><main>Loading</main><script src="/app.js"></script></body></html>'
      : path === "/app.js"
        ? `Promise.allSettled([
            fetch('http://127.0.0.1:1234/secret'),
            fetch('http://[::1]/secret'),
            fetch('http://169.254.169.254/latest/meta-data/'),
            fetch('/write', {method: 'POST', body: 'do not send'})
          ]).then(() => setTimeout(async () => {
            const job = await (await fetch('https://93.184.216.35/api/job')).json();
            const script = document.createElement('script');
            script.type = 'application/ld+json';
            script.textContent = JSON.stringify(job);
            document.head.append(script);
            document.querySelector('main').textContent = job.description;
          }, 1200));`
        : JSON.stringify({ "@type": "JobPosting", title: "Software Engineer", hiringOrganization: { name: "Example" }, description })
    return { buffer: Buffer.from(text), status: 200, finalUrl: url, headers: { "access-control-allow-origin": origin }, contentType: path.endsWith(".js") ? "application/javascript" : path.startsWith("/api/") ? "application/json" : "text/html" }
  }
  const rendered = await renderJobPage(`${origin}/job`, fetchResource)
  const job = parseSource("page", rendered.html, "text/html", `${origin}/job`)
  assert.equal(job.role, "Software Engineer")
  assert.equal(job.company, "Example")
  assert.equal(job.description, description.trim())
  assert.deepEqual(requests.sort(), [`${origin}/job`, `${origin}/app.js`, "https://93.184.216.35/api/job"].sort())
})

test("private initial URLs are rejected before launching Chromium", async () => {
  await assert.rejects(() => renderJobPage("http://127.0.0.1/jobs"), /local or private/)
})

test("redirects to private addresses are blocked", async () => {
  await assert.rejects(() => renderJobPage(`${origin}/redirect`, async () => ({
    buffer: Buffer.from(""), finalUrl: "http://127.0.0.1/private", status: 200, contentType: "text/html",
  })))
})
