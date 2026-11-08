import assert from "node:assert/strict"
import test from "node:test"
import type { CompanyProfile } from "../../companies/profile"
import { publicResearchSources } from "../../research/public-sources"

const profile: CompanyProfile = {
  description: "Inventory software company", match: "website", fetchedAt: "2026-11-08T12:00:00Z",
  facts: [{ label: "Founded", value: "2009", source: "wikidata" }, { label: "SIREN", value: "999999999", source: "registry" }],
  links: [{ label: "Wikipedia", url: "https://en.wikipedia.org/wiki/Northwind" }],
  sources: [{ name: "Wikidata", url: "https://www.wikidata.org/wiki/Q42" }],
}
const article = { type: "standard", title: "Northwind", wikibase_item: "Q42", extract: "Northwind develops inventory software for independent retailers and their suppliers." }

test("verified Wikidata and its matching Wikipedia article enrich the evidence without an API key", async () => {
  const result = await publicResearchSources(profile, async (url, init) => {
    assert.equal(url, "https://en.wikipedia.org/api/rest_v1/page/summary/Northwind")
    assert.equal(init?.redirect, "error")
    assert.equal(new Headers(init?.headers).has("authorization"), false)
    return Response.json(article)
  })
  assert.equal(result.pages.length, 2)
  assert.match(result.pages[0].text!, /Founded: 2009/)
  assert.ok(!result.pages[0].text!.includes("999999999"), "name-only registry facts must not be mixed into the global company")
  assert.equal(result.pages[1].url, profile.links[0].url)
  assert.equal(result.pages[1].text, article.extract)
  assert.deepEqual(result.notes, [])
})

test("name-only matches and untrusted Wikipedia links do not trigger article requests", async () => {
  let calls = 0
  const fetcher: typeof fetch = async () => { calls += 1; return Response.json(article) }
  assert.deepEqual((await publicResearchSources({ ...profile, match: "name" }, fetcher)).pages, [])
  assert.deepEqual((await publicResearchSources(null, fetcher)).pages, [])
  assert.deepEqual((await publicResearchSources({ ...profile, sources: [] }, fetcher)).pages, [])
  for (const url of ["https://en.wikipedia.org.attacker.example/wiki/Northwind", "http://en.wikipedia.org/wiki/Northwind", "https://user:pass@en.wikipedia.org/wiki/Northwind", "https://en.wikipedia.org/wiki/Special:Random"]) {
    assert.equal((await publicResearchSources({ ...profile, links: [{ label: "Wikipedia", url }] }, fetcher)).pages.length, 1)
  }
  assert.equal(calls, 0)
})

test("different entities, disambiguations and invalid payloads are excluded", async () => {
  for (const payload of [{ ...article, wikibase_item: "Q999" }, { ...article, type: "disambiguation" }, { extract: article.extract }]) {
    const result = await publicResearchSources(profile, async () => Response.json(payload))
    assert.equal(result.pages.length, 1)
    assert.equal(result.notes.length, 1)
  }
})

test("a failed free API leaves verified facts available for the AI", async () => {
  for (const fetcher of [async () => new Response("unavailable", { status: 503 }), async () => { throw new Error("timeout") }]) {
    const result = await publicResearchSources(profile, fetcher)
    assert.equal(result.pages.length, 1)
    assert.equal(result.notes.length, 1)
  }
})
