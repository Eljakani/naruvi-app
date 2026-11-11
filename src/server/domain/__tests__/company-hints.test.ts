import assert from "node:assert/strict"
import { test } from "node:test"
import { domainCandidates, guessCompanySite, linkedInTopcard, pageNamesCompany } from "../../jobs/company-hints"
import { resolveCompanySite } from "../../jobs/vendor/company-resolver"

test("linkedin topcard: company page and logo", () => {
  const html = `<a class="topcard__org-name-link topcard__flavor--black-link" href="https://uk.linkedin.com/company/acme-labs?trk=x">Acme</a>
  <a href="https://uk.linkedin.com/company/acme-labs?trk=public_jobs_topcard_logo" data-tracking-control-name="public_jobs_topcard_logo"><img class="artdeco-entity-image" data-delayed-url="https://media.licdn.com/dms/image/v2/X/company-logo_100_100/0/1?e=1&amp;v=beta" alt="Acme"></a>`
  assert.deepEqual(linkedInTopcard(html), { companyPage: "https://uk.linkedin.com/company/acme-labs", logo: "https://media.licdn.com/dms/image/v2/X/company-logo_100_100/0/1?e=1&v=beta" })
})

test("linkedin topcard reads the rendered employer image and ignores unrelated logos", () => {
  const logo = "https://media.licdn.com/dms/image/v2/X/company-logo_100_100/0/employer"
  const html = `<a href='https://www.linkedin.com/company/acme' class='topcard__org-logo-link'>
    <img src='${logo}' data-delayed-url='https://static.licdn.com/placeholder.png'>
  </a>
  <a href='https://www.linkedin.com/company/other'><img src='https://media.licdn.com/company-logo/other'></a>`
  assert.equal(linkedInTopcard(html).logo, logo)
  assert.equal(linkedInTopcard(html.replace(logo, "https://example.com/company-logo")).logo, "")
})

test("domain candidates include acronyms and the local TLD", () => {
  const candidates = domainCandidates("Hilbert Investment Solutions SAS", "Paris, France")
  assert.ok(candidates.includes("https://hilbert-is.com"))
  assert.ok(candidates.includes("https://hilbertinvestmentsolutions.fr"))
})

test("a guessed page must name the company", () => {
  assert.equal(pageNamesCompany("<title>Hilbert Investment Solutions | Quant tools</title>", "Hilbert Investment Solutions"), true)
  assert.equal(pageNamesCompany("<title>Hilbert Spaces — maths blog</title>", "Hilbert Investment Solutions"), false)
  assert.equal(pageNamesCompany('<footer>© 2026 Acme Labs. All rights reserved.</footer>', "Acme Labs SAS"), true)
})

test("guess: first verified candidate wins; unverified pages are ignored", async () => {
  const pages: Record<string, string> = { "https://hilbert.com": "<title>Hilbert Hotel</title>", "https://hilbert-is.com": "<title>Hilbert Investment Solutions</title>" }
  const site = await guessCompanySite("Hilbert Investment Solutions", "", async (url) => (pages[url] ? { html: pages[url], finalUrl: url } : null))
  assert.equal(site, "https://hilbert-is.com")
})

test("a parked domain that only prints its own name is not the company's site", async () => {
  const parked = `<html><head><title>tiime.com</title></head><body><h1>tiime.com</h1><p>This domain is for sale. Make an offer.</p></body></html>`
  const real = `<html><head><title>Logiciel compta pour entrepreneurs | Tiime</title></head><body>© 2026 Tiime</body></html>`
  assert.equal(pageNamesCompany(parked, "Tiime"), false)
  assert.equal(pageNamesCompany(`<title>tiime.com</title>`, "Tiime"), false)
  assert.equal(pageNamesCompany(real, "Tiime"), true)
  const pages: Record<string, string> = { "https://tiime.com": parked, "https://tiime.fr": real }
  const site = await resolveCompanySite({ company: "Tiime", pageUrl: "", finalUrl: "", structuredUrls: [], html: "", description: "" }, async (url: string) => (pages[url] ? { html: pages[url], finalUrl: url } : null))
  assert.equal(site.url, "https://tiime.fr")
})
