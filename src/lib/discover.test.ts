import assert from "node:assert/strict"
import { test } from "node:test"
import { DISCOVER_ACTORS, discoveredKeywords, discoverSearches, excerpt, goalRoles, leadParts, skillMatches, titleFits } from "./discover"
import { searchGoal } from "./search-goals"

const goal = (extra: object) => searchGoal.parse({ id: "g", name: "Goal", ...extra })
const profile = { location: "Lyon", goals: [goal({ roles: ["Backend engineer"], places: ["Paris"], workModes: ["remote"] })] }

test("searches are each goal's roles in that goal's places", () => {
  assert.deepEqual(discoverSearches(profile), [{ keywords: "Backend engineer", location: "Paris", country: "fr" }, { keywords: "Backend engineer", location: "Remote", country: "fr" }])
})

test("every role is searched, places are cut to keep six searches at most", () => {
  const searches = discoverSearches({ ...profile, goals: [goal({ roles: ["Go developer", "SRE", "Platform engineer"], places: ["Paris", "Lyon", "Nantes", "Lille"] })] })
  assert.equal(searches.length, 6)
  assert.deepEqual([...new Set(searches.map((search) => search.keywords))], ["Go developer", "SRE", "Platform engineer"])
  assert.deepEqual([...new Set(searches.map((search) => search.location))], ["Paris", "Lyon"])
})

test("no active goal with roles, no search", () => {
  assert.deepEqual(discoverSearches({ location: "Lyon", goals: [] }), [])
  assert.deepEqual(discoverSearches({ location: "Lyon", goals: [goal({ places: ["Paris"] })] }), [])
  assert.deepEqual(discoverSearches({ location: "Lyon", goals: [goal({ roles: ["SRE"], active: false })] }), [])
})

test("a goal without places searches your location", () => {
  assert.deepEqual(discoverSearches({ location: "Lyon", goals: [goal({ roles: ["SRE"] })] }).map((search) => search.location), ["Lyon"])
})

test("a lead's title must be about a keyword, not just share a job-title word", () => {
  const keywords = ["DevSecOps", "DevOps", "Cyber Security engineer"]
  assert.equal(titleFits("Senior DevOps Engineer · Sopra Steria", keywords), true)
  assert.equal(titleFits("Developer Security Operations · Sekoia", keywords), true)
  assert.equal(titleFits("Cloud & App Security (SecDevOps) F/H · EY", ["DevOps"]), true)
  assert.equal(titleFits("Java Software Engineer · Capgemini", keywords), false)
  assert.equal(titleFits("Data Engineer", ["Engineer"]), true)
  assert.deepEqual(discoveredKeywords("Discovered: DevSecOps, DevOps"), ["DevSecOps", "DevOps"])
  assert.equal(discoveredKeywords("Job alert email"), null)
})

test("a LinkedIn item becomes a lead with its company, logo and text; junk is dropped", () => {
  const lead = DISCOVER_ACTORS.linkedin.lead({ link: "https://www.linkedin.com/jobs/view/4123456789/?trk=x", title: "SRE", companyName: "Acme", location: "Paris", employmentType: "Full-time", descriptionText: "Run Kubernetes.", companyLogo: "https://media.licdn.com/logo.png" })
  assert.ok(lead)
  assert.equal(lead.title, "SRE · Acme")
  assert.equal(lead.company, "Acme")
  assert.equal(lead.logo, "https://media.licdn.com/logo.png")
  assert.match(lead.text, /Run Kubernetes\./)
  assert.equal(DISCOVER_ACTORS.linkedin.lead({ title: "No link" }), null)
  assert.equal(DISCOVER_ACTORS.linkedin.lead({ link: "https://www.linkedin.com/jobs/view/4123456780", title: "x", companyLogo: "javascript:alert(1)" })?.logo, "")
})

test("Indeed needs a country to search", () => {
  assert.equal(DISCOVER_ACTORS.indeed.input({ keywords: "SRE", location: "Remote", country: null }, 10), null)
  assert.deepEqual(DISCOVER_ACTORS.indeed.input({ keywords: "SRE", location: "Paris", country: "fr" }, 10), { position: "SRE", location: "Paris", country: "FR", maxItemsPerSearch: 10, parseCompanyDetails: false, saveOnlyUniqueItems: true })
})

test("skills match as whole words", () => {
  assert.deepEqual(skillMatches("We use Go and Google Cloud, plus C++.", ["Go", "go", "C++", "Rust", "G"]), ["Go", "C++"])
  assert.deepEqual(skillMatches("Working at Google", ["Go"]), [])
})

test("a discovered lead's text splits into facts and the posting", () => {
  assert.deepEqual(leadParts("SRE\nAcme\nParis\nFull-time\n\nRun Kubernetes.", true), { facts: ["Paris", "Full-time"], body: "Run Kubernetes." })
  assert.deepEqual(leadParts("Saved page\n\nmore", false), { facts: [], body: "Saved page\n\nmore" })
  assert.equal(excerpt("one two three four", 9), "one two…")
})

test("roles match their spelled-out forms, and a careers page keeps only your goals' roles", () => {
  const roles = goalRoles([goal({ roles: ["DevOps", "AppSec"] }), goal({ roles: ["Data"], active: false })])
  assert.deepEqual(roles, ["DevOps", "AppSec"])
  assert.equal(titleFits("Application Security Engineer", roles), true)
  assert.equal(titleFits("Site Reliability Engineer", roles), true)
  assert.equal(titleFits("Lead Accountant", roles), false)
  assert.equal(titleFits("Staff Product Manager, AI Agents & Assistant", roles), false)
})
