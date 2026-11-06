import assert from "node:assert/strict"
import test from "node:test"
import { canonicalJobUrl, extractJobLeads } from "./job-alerts"

test("posting links are canonical and tracking is dropped", () => {
  assert.deepEqual(canonicalJobUrl("https://www.linkedin.com/comm/jobs/view/4012345678/?trackingId=abc&refId=x"), { url: "https://www.linkedin.com/jobs/view/4012345678/", board: "linkedin" })
  assert.equal(canonicalJobUrl("https://fr.indeed.com/rc/clk?jk=1a2b3c4d5e6f7a8b&from=ja")?.url, "https://fr.indeed.com/viewjob?jk=1a2b3c4d5e6f7a8b")
  assert.equal(canonicalJobUrl("https://click.example.com/r?url=https%3A%2F%2Fjobs.lever.co%2Facme%2F123-abc%3Fsource%3Demail")?.url, "https://jobs.lever.co/acme/123-abc")
  assert.equal(canonicalJobUrl("https://www.linkedin.com/feed/"), null)
})

test("alerts give one lead per job with the most useful title", () => {
  const html = `
    <a href="https://www.linkedin.com/comm/jobs/view/4012345678/?trk=1"><img src="x"></a>
    <a href="https://www.linkedin.com/comm/jobs/view/4012345678/?trk=2">Cloud Security Engineer</a>
    <a href="https://www.linkedin.com/comm/jobs/view/4012345678/?trk=3">View job</a>
    <a href="https://www.linkedin.com/comm/jobs/view/4099999999/">DevSecOps Lead &amp; Architect</a>
    <a href="https://www.linkedin.com/settings/">Unsubscribe</a>`
  const leads = extractJobLeads(html, "")
  assert.deepEqual(leads.map((lead) => lead.title), ["Cloud Security Engineer", "DevSecOps Lead & Architect"])
})
