import assert from "node:assert/strict"
import test from "node:test"
import { summarizeCompany } from "../../research/company-summary"
import { extractCompanyPage, extractPage } from "../../research/extract"
import { companyRedirectAllowed } from "../../research/site-domain"

const page = extractPage('<title>Northwind</title><meta name="description" content="Northwind builds inventory software for independent retailers."><p>Our tools help shops manage stock and suppliers.</p>', "https://northwind.example/")
const summary = "Northwind develops inventory software for independent retailers. Its tools help shops manage their stock and suppliers."
const completion = (text: string, sources = ["S1"]) => ({ text: JSON.stringify({ text, sources }), model: "test-model", inputTokens: null, outputTokens: null })

test("AI reformulates company evidence and returns verified source URLs", async () => {
  const result = await summarizeCompany({ company: "Northwind", language: "en", pages: [page] }, async (input) => {
    assert.match(input.system, /UNTRUSTED DATA/)
    assert.match(input.system, /own words/)
    const data = JSON.parse(input.user)
    assert.equal(data.sources[0].id, "S1")
    assert.match(data.sources[0].text, /stock and suppliers/)
    return completion(summary)
  })
  assert.deepEqual(result, { summary: { text: summary, sources: [page.url] }, model: "test-model" })
})

test("AI summaries reject unknown citations and invented numbers", async () => {
  for (const reply of [completion(summary, ["missing"]), completion("Northwind builds inventory software for 500 retailers around the world.")]) {
    await assert.rejects(summarizeCompany({ company: "Northwind", language: "en", pages: [page] }, async () => reply), /could not be verified/)
  }
})

test("public enrichment remains in the AI context after six company website pages", async () => {
  const pages = [...Array.from({ length: 6 }, (_, index) => ({ ...page, url: `${page.url}${index}` })), { ...page, title: "Wikidata · Northwind", url: "https://www.wikidata.org/wiki/Q42" }, { ...page, title: "Wikipedia · Northwind", url: "https://en.wikipedia.org/wiki/Northwind" }]
  const result = await summarizeCompany({ company: "Northwind", language: "en", pages }, async (input) => {
    assert.equal(JSON.parse(input.user).sources.length, 8)
    assert.match(JSON.parse(input.user).sources[7].text, /Wikipedia/)
    assert.match(input.system, /historical claims/)
    return completion(summary, ["S8"])
  })
  assert.deepEqual(result.summary?.sources, [pages[7].url])
})

test("empty evidence and provider failures never produce a fabricated fallback", async () => {
  let called = false
  await assert.rejects(summarizeCompany({ company: "Northwind", language: "en", pages: [] }, async () => { called = true; return completion(summary) }), /No company pages/)
  assert.equal(called, false)
  await assert.rejects(summarizeCompany({ company: "Northwind", language: "en", pages: [page] }, async () => { throw new Error("Provider unavailable") }), /Provider unavailable/)
})

test("conventional company URLs that resolve to user profiles are excluded", () => {
  assert.equal(extractCompanyPage('<title>about (Xay)</title><meta name="description" content="User profile of Xay on Hugging Face">', "https://huggingface.co/about"), null)
  assert.ok(extractCompanyPage('<title>Hugging Face</title><meta name="description" content="The AI community building the future.">', "https://huggingface.co/"))
})

test("company homepages can redirect to the same brand's country domain", () => {
  assert.equal(companyRedirectAllowed("https://doctolib.com", "https://www.doctolib.fr/"), true)
  assert.equal(companyRedirectAllowed("https://example.co.uk", "https://www.example.fr/"), true)
  assert.equal(companyRedirectAllowed("https://example.com", "https://careers.example.com/"), true)
  for (const target of ["https://unrelated.example/", "https://example.com.attacker.org/", "https://www.linkedin.com/company/example", "http://example.fr/", "https://user:password@example.fr/"]) {
    assert.equal(companyRedirectAllowed("https://example.com", target), false, target)
  }
})

test("a reply that can't say what the company does is not stored as an overview", async () => {
  const result = await summarizeCompany({ company: "Northwind", language: "fr", pages: [page] }, async () => ({ text: JSON.stringify({ established: false, text: "Les sources ne disent pas ce que fait Northwind.", sources: ["S1"] }), model: "test-model", inputTokens: null, outputTokens: null }))
  assert.deepEqual(result, { summary: null, model: "test-model" })
})
