import assert from "node:assert/strict"
import test from "node:test"
import { parseIdentity, parsePool } from "../../profile/pool-parser"

const ORACLE = `# Oracle Research & Development

Type: Experience
ID: exp-oracle-rd
Status: verified
Tags: devsecops, cloud, oci

## Display

### English

Role: DevSecOps Engineer - Final Year Internship

Organization: Oracle Research & Development

Dates: Feb. 2025 - Aug. 2025

### French

Role: Ingénieur DevSecOps - Stage PFE

## Truth Source

- Reduced execution time by 66%.
- Saved $3,600 per month.

## Approved Bullet Variants

### DevSecOps / Cloud

- [en] Delivered a **66% reduction in execution time**.
- [fr] **66% de réduction du temps d'exécution**.

## Do Not Claim

- Do not claim ownership of all Oracle cloud security.
`

test("parses an experience pool into display, facts, phrasings and rules", () => {
  const entry = parsePool(ORACLE, "x")
  assert.equal(entry.key, "exp-oracle-rd")
  assert.equal(entry.kind, "experience")
  assert.equal(entry.status, "verified")
  assert.deepEqual(entry.tags, ["devsecops", "cloud", "oci"])
  assert.equal(entry.display.en.role, "DevSecOps Engineer - Final Year Internship")
  assert.equal(entry.display.fr.role, "Ingénieur DevSecOps - Stage PFE")
  assert.equal(entry.facts.length, 2)
  assert.deepEqual(entry.phrasings.map((p) => [p.group, p.language]), [["DevSecOps / Cloud", "en"], ["DevSecOps / Cloud", "fr"]])
  assert.equal(entry.doNotClaim.length, 1)
  assert.equal(entry.confidential, false)
})

test("NDA status and skill clusters", () => {
  const entry = parsePool("# Koveria\n\nType: Experience\nID: exp-koveria\nStatus: verified-nda-sensitive\n\n## Skills\n\n- OCI\n- AWS\n", "k")
  assert.equal(entry.confidential, true)
  assert.equal(entry.status, "verified")
  assert.deepEqual(entry.skills, ["OCI", "AWS"])
})

test("parses identity contact and locked fields", () => {
  const id = parseIdentity("# Identity\n\n## Display\n\nName: Jane Doe\n\nLocation: Paris\n\n## Contact\n\nEmail: j@x.io\n\nGitHub: https://github.com/j\n\n## Do Not Change Without Explicit Request\n\n- Email address\n")
  assert.equal(id.fullName, "Jane Doe")
  assert.equal(id.email, "j@x.io")
  assert.deepEqual(id.links, [{ label: "GitHub", url: "https://github.com/j" }])
  assert.deepEqual(id.locked, ["Email address"])
})
