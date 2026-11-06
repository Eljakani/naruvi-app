import assert from "node:assert/strict"
import test from "node:test"
import { descriptionFacts, linkedinImport, parseCsv } from "./linkedin-export"

test("CSV handles quotes, commas and line breaks inside fields", () => {
  const rows = parseCsv('Company Name,Title,Description\n"Acme, Inc.",Engineer,"Built the API\nCut costs by 30%"\n')
  assert.deepEqual(rows, [{ "Company Name": "Acme, Inc.", Title: "Engineer", Description: "Built the API\nCut costs by 30%" }])
})

test("descriptions become one fact per line or bullet", () => {
  assert.deepEqual(descriptionFacts("• Led the migration to Kubernetes\n• Reduced deploy time by 40%"), ["Led the migration to Kubernetes", "Reduced deploy time by 40%"])
})

test("a LinkedIn export becomes entries, skills, languages and identity", () => {
  const result = linkedinImport({
    "Profile.csv": 'First Name,Last Name,Headline,Summary,Geo Location,Websites\nAlex,Morgan,Cloud security engineer,"I build secure platforms and the tools around them",Paris,"[PORTFOLIO:https://alex.dev]"\n',
    "Positions.csv": 'Company Name,Title,Description,Location,Started On,Finished On\nAcme,Security Engineer,"Ran threat modeling for 12 teams\nBuilt the SAST pipeline",Paris,Mar 2023,\n',
    "Education.csv": "School Name,Start Date,End Date,Notes,Degree Name,Activities\nENSA,2015,2020,,Engineering degree,\n",
    "Skills.csv": "Name\nTerraform\nKubernetes\nTerraform\n",
    "Languages.csv": "Name,Proficiency\nFrench,Native or bilingual proficiency\n",
    "Email Addresses.csv": "Email Address,Confirmed,Primary,Updated On\nalex@example.org,Yes,Yes,\n",
  })
  assert.equal(result.identity.fullName, "Alex Morgan")
  assert.equal(result.identity.email, "alex@example.org")
  assert.deepEqual(result.identity.links, [{ label: "Portfolio", url: "https://alex.dev" }])
  const job = result.entries.find((entry) => entry.kind === "experience")!
  assert.equal(job.display.dates, "Mar 2023 – Present")
  assert.deepEqual(job.facts, ["Ran threat modeling for 12 teams", "Built the SAST pipeline"])
  assert.deepEqual(result.entries.find((entry) => entry.kind === "skill")?.skills, ["Terraform", "Kubernetes"])
  assert.deepEqual(result.entries.find((entry) => entry.kind === "language")?.skills, ["French (Native or bilingual)"])
  assert.equal(result.entries.find((entry) => entry.kind === "education")?.display.dates, "2015 – 2020")
})
