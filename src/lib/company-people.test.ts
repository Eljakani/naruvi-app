import assert from "node:assert/strict"
import { test } from "node:test"
import { linkedinCompany, peopleInput, peopleTitles, personFrom } from "./company-people"

test("titles from a comma list, deduplicated", () => {
  assert.deepEqual(peopleTitles("Recruiter, Talent acquisition;Recruiter\n , a"), ["Recruiter", "Talent acquisition", "a"])
})

test("the actor searches the company's domain", () => {
  assert.deepEqual(peopleInput("https://www.doctolib.fr/about", ["Recruiter"], 5), { company: "doctolib.fr", maxResults: 5, title: ["Recruiter"], titleMatchMode: "SMART", findEmail: false })
  assert.equal("title" in peopleInput("https://doctolib.fr", []), false)
})

test("a person needs a name and a LinkedIn profile link", () => {
  assert.deepEqual(personFrom({ status: "success", full_name: "Ada Lovelace", title: "Engineering Manager", linkedin_url: "http://www.linkedin.com/in/ada/", location: "Paris, France" }), { name: "Ada Lovelace", title: "Engineering Manager", linkedinUrl: "https://www.linkedin.com/in/ada", location: "Paris, France", email: "" })
  assert.equal(personFrom({ status: "not_found", full_name: "X", linkedin_url: "https://linkedin.com/in/x" }), null)
  assert.equal(personFrom({ full_name: "X", linkedin_url: "https://evil.example/in/x" }), null)
})

test("a LinkedIn company page is used as is, cleaned", () => {
  assert.equal(linkedinCompany("linkedin.com/company/exalt-it/people/?x=1"), "https://www.linkedin.com/company/exalt-it")
  assert.equal(linkedinCompany("https://exalt.fr"), null)
  assert.equal(peopleInput("https://fr.linkedin.com/company/exalt-it", []).company, "https://www.linkedin.com/company/exalt-it")
})

test("a small, young company is a startup; a big or unknown one isn't called one", async () => {
  const { startupSignal } = await import("./company-people")
  assert.deepEqual(startupSignal([{ label: "Staff (France)", value: "10–19" }, { label: "Registered", value: "2021" }], 2026), { startup: true, reason: { size: "10–19", since: "2021" } })
  assert.equal(startupSignal([{ label: "Size", value: "Small or medium business" }, { label: "Founded", value: "2019" }], 2026).startup, true)
  assert.equal(startupSignal([{ label: "Employees", value: "164,000" }, { label: "Founded", value: "2020" }], 2026).startup, false)
  assert.equal(startupSignal([{ label: "Size", value: "Mid-size company" }], 2026).startup, false)
  assert.equal(startupSignal([{ label: "Staff (France)", value: "50–99" }, { label: "Registered", value: "1998" }], 2026).startup, false)
  assert.equal(startupSignal([], 2026).startup, null)
})

test("chosen groups send every title, your own first, each once", async () => {
  const { searchTitles, BUILT_IN_GROUPS, TITLE_LIMIT, defaultGroups } = await import("./company-people")
  assert.deepEqual(defaultGroups(BUILT_IN_GROUPS, true), ["founders", "tech"])
  assert.deepEqual(defaultGroups(BUILT_IN_GROUPS, false), ["tech", "recruiting"])
  // Size unknown: founders and recruiters both, since a tiny company may have nobody else.
  assert.deepEqual(defaultGroups(BUILT_IN_GROUPS, null), ["founders", "tech", "recruiting"])
  const titles = searchTitles(BUILT_IN_GROUPS, ["founders", "tech"], ["Head of Data", "cto"])
  assert.equal(titles[0], "Head of Data")
  assert.ok(titles.includes("Fondateur") && titles.includes("Directeur technique"))
  assert.equal(titles.filter((title) => title.toLowerCase() === "cto").length, 1)
  assert.ok(searchTitles(BUILT_IN_GROUPS, BUILT_IN_GROUPS.map((group) => group.id), []).length <= TITLE_LIMIT)
})

test("role groups are regenerated when the goals' roles change or the profile drifts, not for small edits", async () => {
  const { basisDrifted } = await import("./company-people")
  const before = { roles: ["DevOps", "AppSec"], headline: "DevSecOps engineer · Kubernetes, AWS", skills: ["Kubernetes", "AWS", "Terraform", "Docker", "Python", "Go"] }
  assert.equal(basisDrifted(null, before), true)
  assert.equal(basisDrifted(before, { ...before, skills: [...before.skills, "Ansible"] }), false)
  assert.equal(basisDrifted(before, { ...before, roles: ["appsec", "devops"] }), false)
  assert.equal(basisDrifted(before, { ...before, roles: ["Data engineer"] }), true)
  assert.equal(basisDrifted(before, { ...before, headline: "Product designer · Figma", skills: ["Figma", "User research", "Prototyping"] }), true)
})

test("contacts are sorted into kinds by title, most senior first", async () => {
  const { contactKind } = await import("./company-people")
  assert.equal(contactKind("CEO & Co-Founder"), "leader")
  assert.equal(contactKind("Co-Founder & CTO"), "leader")
  assert.equal(contactKind("Talent Acquisition Specialist IT"), "recruiting")
  assert.equal(contactKind("IT Talent Acquisition"), "recruiting")
  assert.equal(contactKind("Responsable RH"), "hr")
  assert.equal(contactKind("Head of Security"), "tech")
  assert.equal(contactKind("Account Executive"), "other")
})
