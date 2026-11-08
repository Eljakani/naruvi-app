import assert from "node:assert/strict"
import test from "node:test"
import { buildBrief, postingAbout } from "../../research/brief"
import { extractPage } from "../../research/extract"

const HOME = `<html><head><title>Fresh Market — Local food, fairly sourced</title>
<meta name="description" content="Fresh Market runs neighbourhood grocery stores that source from local farms.">
<script type="application/ld+json">{"@context":"https://schema.org","@type":"Organization","name":"Fresh Market","foundingDate":"2009-04-01","numberOfEmployees":{"@type":"QuantitativeValue","value":850},"address":[{"addressLocality":"Lyon","addressCountry":"FR"}],"slogan":"Good food, close to home"}</script>
<script>window.track("ignore me. Our mission is fake.")</script></head>
<body><nav>Home About Careers</nav><h1>Good food, close to home</h1>
<p>Our mission is to make fresh, local food affordable for every neighbourhood. We work with more than 300 farms across the region.</p>
<h2>Our values</h2><ul><li>Respect for growers</li><li>Zero waste</li><li>Neighbours first</li></ul>
<footer>© 2026 Fresh Market. All rights reserved. We use cookies.</footer></body></html>`

test("extracts mission, scale, values and JSON-LD; ignores scripts and boilerplate", () => {
  const page = extractPage(HOME, "https://freshmarket.example/")
  assert.equal(page.title, "Fresh Market — Local food, fairly sourced")
  assert.deepEqual(page.values, ["Respect for growers", "Zero waste", "Neighbours first"])
  assert.equal(page.organization?.foundingDate, "2009")
  assert.equal(page.organization?.employees, "850")
  assert.deepEqual(page.organization?.locations, ["Lyon, FR"])
  assert.ok(page.statements.some((s) => s.kind === "mission" && s.text.startsWith("Our mission is to make fresh")))
  assert.ok(!page.statements.some((s) => /fake|cookies/.test(s.text)))
})

test("posting 'About' section is used as a source", () => {
  const job = "About Fresh Market\nWe run 40 stores in the Rhône region.\n\nAbout the role\nYou will manage a store."
  assert.deepEqual(postingAbout(job, "Fresh Market"), ["We run 40 stores in the Rhône region."])
})

test("brief keeps a source on every item and offers prompts, not prose", () => {
  const page = extractPage(HOME, "https://freshmarket.example/")
  const brief = buildBrief({ company: "Fresh Market", website: "https://freshmarket.example", pages: [page], jobText: "About Fresh Market\nWe run 40 neighbourhood stores across the Rhône region.", language: "en", now: new Date("2026-11-05") })
  assert.ok([...brief.about, ...brief.mission, ...brief.values].every((item) => item.source))
  assert.equal(brief.about[0].source, "job posting")
  assert.deepEqual(brief.facts.map((f) => f.label), ["Founded", "Size", "Locations", "Tagline", "Scale"])
  assert.match(brief.prompts[0], /^Their mission: “Our mission is to make fresh/)
  assert.ok(brief.prompts.every((prompt) => prompt.endsWith("?")))
  const fr = buildBrief({ company: "Fresh Market", website: "", pages: [page], jobText: "", language: "fr" })
  assert.match(fr.prompts[0], /^Leur mission/)
  assert.match(fr.starters[0], /^Ce qui m'attire chez Fresh Market/)
})

test("robots.txt: longest matching rule wins, only for *", async () => {
  const { robotsAllows } = await import("../../research/robots")
  const robots = "User-agent: Googlebot\nDisallow: /\n\nUser-agent: *\nDisallow: /admin\nDisallow: /careers/internal\nAllow: /careers"
  assert.equal(robotsAllows(robots, "/about"), true)
  assert.equal(robotsAllows(robots, "/admin/x"), false)
  assert.equal(robotsAllows(robots, "/careers"), true)
  assert.equal(robotsAllows(robots, "/careers/internal/1"), false)
  assert.equal(robotsAllows("User-agent: *\nDisallow: /", "/about"), false)
  assert.equal(robotsAllows("", "/about"), true)
})

test("standalone company research builds a sourced brief without job or application data", () => {
  const page = extractPage(HOME, "https://freshmarket.example/")
  const brief = buildBrief({ company: "Fresh Market", website: "https://freshmarket.example", pages: [page], jobText: "", language: "en" })
  assert.ok(brief.about.length)
  assert.ok(brief.mission.length)
  assert.ok(brief.values.length)
  assert.ok(brief.facts.some((fact) => fact.label === "Founded" && fact.value === "2009"))
  assert.ok([...brief.about, ...brief.mission, ...brief.values, ...brief.facts].every((item) => item.source === page.url))
  assert.deepEqual(brief.sources, [{ url: page.url, title: page.title }])
})

test("company facts need the company as subject; posting mission is found", async () => {
  const { classifySentences } = await import("../../research/extract")
  assert.deepEqual(classifySentences("1 in 3 professional logins use a weak password.", "Dashlane"), [])
  assert.equal(classifySentences("Dashlane protects 25,000 businesses worldwide.", "Dashlane")[0]?.kind, "scale")
  const brief = buildBrief({ company: "Dashlane", website: "", pages: [], jobText: "About Dashlane\nDashlane’s mission is to deliver the credential security every business needs. Millions trust it.", language: "en" })
  assert.equal(brief.mission[0]?.source, "job posting")
  assert.match(brief.prompts[0], /^Their mission/)
})

test("robots wildcards do not block whole sites", async () => {
  const { robotsAllows } = await import("../../research/robots")
  const robots = "User-Agent: *\nDisallow: /*/debug-error/*\nDisallow: /*.pdf$"
  assert.equal(robotsAllows(robots, "/"), true)
  assert.equal(robotsAllows(robots, "/about"), true)
  assert.equal(robotsAllows(robots, "/en/debug-error/1"), false)
  assert.equal(robotsAllows(robots, "/report.pdf"), false)
  assert.equal(robotsAllows(robots, "/report.pdf?x=1"), true)
})
