import assert from "node:assert/strict"
import test from "node:test"
import { extractNumbers, supportFor, verifySupport } from "../grounding"

const facts = [
  { id: "f1", statement: "Reduced execution time by 66%." },
  { id: "f2", statement: "Saved $3,600 per month." },
  { id: "f3", statement: "Reduced cloud costs by 80%." },
  { id: "f4", statement: "Deployed distributed monitoring with Prometheus and Ansible." },
  { id: "f5", statement: "Covered 50+ servers." },
  { id: "f6", statement: "Used JFrog Artifactory for package management." },
]

test("extractNumbers normalizes money, percents and plus signs, ignores years", () => {
  assert.deepEqual(extractNumbers("**$3,600/month** (80% cost) across 50+ servers in 2025"), ["3600", "80%", "50"])
  assert.deepEqual(extractNumbers("66 % plus rapide"), ["66%"])
})

test("supportFor links EN and FR phrasings to the facts behind their numbers", () => {
  const en = supportFor("Automated OCI workflows: **66% faster** and **$3,600/month saved (80% cost reduction)**.", facts)
  assert.deepEqual(en.factIds.sort(), ["f1", "f2", "f3"])
  assert.equal(en.grounded, true)
  const fr = supportFor("Monitoring Prometheus/Ansible sur 50+ serveurs.", facts)
  assert.ok(fr.factIds.includes("f4") && fr.factIds.includes("f5"))
  assert.equal(fr.grounded, true)
})

test("an invented number is flagged even when other facts match", () => {
  const result = supportFor("Built Prometheus monitoring on 120 servers, cutting costs by 80%.", facts)
  assert.deepEqual(result.unsupportedNumbers, ["120"])
  assert.equal(result.grounded, false)
})

test("verifySupport with no supporting facts is never grounded", () => {
  assert.equal(verifySupport("Led the security team.", []).grounded, false)
})

test("rankFacts puts number matches first, then vocabulary", async () => {
  const { rankFacts } = await import("../grounding")
  const ranked = rankFacts("Covered 50+ servers with Prometheus monitoring.", facts)
  assert.equal(ranked[0].id, "f5")
  assert.deepEqual(ranked[0].sharedNumbers, ["50"])
  assert.equal(ranked[1].id, "f4")
})
