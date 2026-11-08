import assert from "node:assert/strict"
import { test } from "node:test"
import { boardApi, boardOf, postingsFrom } from "./careers-boards"

test("boards are recognised from careers and posting URLs", () => {
  assert.deepEqual(boardOf("https://job-boards.greenhouse.io/datadog/jobs/123"), { provider: "greenhouse", slug: "datadog" })
  assert.deepEqual(boardOf("https://boards.greenhouse.io/embed/job_board?for=Stripe"), { provider: "greenhouse", slug: "stripe" })
  assert.deepEqual(boardOf("https://jobs.lever.co/mistral/abc-def"), { provider: "lever", slug: "mistral" })
  assert.deepEqual(boardOf("https://jobs.ashbyhq.com/alan"), { provider: "ashby", slug: "alan" })
  assert.deepEqual(boardOf("https://acme.recruitee.com/o/devops"), { provider: "recruitee", slug: "acme" })
  assert.deepEqual(boardOf("https://apply.workable.com/qonto/j/ABC/"), { provider: "workable", slug: "qonto" })
  assert.equal(boardOf("https://www.linkedin.com/jobs/view/123"), null)
  assert.equal(boardOf("not a url"), null)
  assert.equal(boardApi({ provider: "lever", slug: "mistral" }), "https://api.lever.co/v0/postings/mistral?mode=json")
})

test("payloads become postings and malformed rows are dropped", () => {
  const greenhouse = postingsFrom({ provider: "greenhouse", slug: "x" }, { jobs: [{ absolute_url: "https://x.com/jobs/1", title: "Intern", location: { name: "Paris" } }, { title: "no url" }] })
  assert.deepEqual(greenhouse, [{ url: "https://x.com/jobs/1", title: "Intern", location: "Paris", remote: "", contract: "" }])
  const lever = postingsFrom({ provider: "lever", slug: "x" }, [{ hostedUrl: "https://jobs.lever.co/x/1", text: "SRE", categories: { location: "Lyon", commitment: "CDI" }, workplaceType: "hybrid" }])
  assert.equal(lever[0].contract, "CDI")
  const smart = postingsFrom({ provider: "smartrecruiters", slug: "acme" }, { content: [{ id: "9", name: "Stage", location: { city: "Paris", country: "fr" } }] })
  assert.equal(smart[0].url, "https://jobs.smartrecruiters.com/acme/9")
  assert.deepEqual(postingsFrom({ provider: "ashby", slug: "x" }, null), [])
})
