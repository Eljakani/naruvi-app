import assert from "node:assert/strict"
import test from "node:test"
import { keywordsIn } from "../../analysis/keywords"
import { analyze, indexFacts, matchRequirement, type ProfileFact } from "../../analysis/match"
import { coverLetterDecision, extractRequirements, type Requirement } from "../../analysis/requirements"

const fact = (id: string, statement: string, entry = "Oracle", extra: Partial<ProfileFact> = {}): ProfileFact => ({
  id,
  statement,
  entryId: `e-${entry}`,
  entryTitle: entry,
  entryKind: "experience",
  entryTags: [],
  entrySkills: [],
  ...extra,
})

const req = (text: string, kind: Requirement["kind"] = "must"): Requirement => ({ id: "r", text, kind, section: "", keywords: keywordsIn(text), years: null })

const facts = indexFacts([
  fact("f1", "Deployed distributed monitoring with Prometheus and Ansible across 50+ servers."),
  fact("f2", "Integrated SAST (Semgrep) and DAST scans into GitLab CI pipelines.", "Northwind"),
  fact("f3", "Built a Kubernetes operator in Go.", "Contoso", { entryTags: ["aws"] }),
])

test("vocabulary: synonyms and no false positives", () => {
  assert.deepEqual(keywordsIn("Experience with k8s and Terraform on AWS"), ["AWS", "Kubernetes", "Terraform"])
  assert.deepEqual(keywordsIn("Ability to generate networking (internal and external)."), [])
  assert.ok(keywordsIn("Maîtrise des tests d'intrusion").includes("Penetration testing"))
})

test("met only when fact statements prove every named skill", () => {
  const m = matchRequirement(req("Hands-on with SAST/DAST in CI/CD pipelines"), facts)
  assert.equal(m.status, "met")
  assert.deepEqual(m.factIds, ["f2"])
})

test("partial when a skill is missing or only in tags", () => {
  const missing = matchRequirement(req("Kubernetes and Terraform in production"), facts)
  assert.equal(missing.status, "partial")
  assert.deepEqual(missing.missing, ["Terraform"])
  const tagOnly = matchRequirement(req("Experience with AWS"), facts)
  assert.equal(tagOnly.status, "partial")
  assert.match(tagOnly.note, /only appears in entry tags/)
})

test("gap and judgement are never treated as met", () => {
  assert.equal(matchRequirement(req("Deep expertise in Rust"), facts).status, "gap")
  assert.equal(matchRequirement(req("You engage and listen empathetically to others"), facts).status, "judgement")
})

test("years are flagged, not verified", () => {
  const r = { ...req("5+ years with Prometheus monitoring"), years: 5 }
  assert.match(matchRequirement(r, facts).note, /can't prove 5\+ years/)
})

test("fit score weights must over nice and ignores judgement items", () => {
  const result = analyze(
    [req("SAST and DAST in CI/CD"), req("Rust", "nice"), req("Team player attitude")],
    [fact("f2", "Integrated SAST (Semgrep) and DAST scans into GitLab CI pipelines.", "Northwind")],
    "SAST DAST Rust",
  )
  assert.equal(result.fitScore, Math.round((1 / 1.4) * 100))
  assert.equal(result.counts.judgement, 1)
  assert.deepEqual(result.recommendedEntries.map((e) => e.title), ["Northwind"])
})

test("requirement extraction classifies sections and reads year ranges", () => {
  const reqs = extractRequirements("What you'll do\n- Secure our cloud\n\nRequirements\n- 3-5+ years of Python\n- Terraform\n\nNice to have\n- Go\n\nBenefits\n- Free lunch")
  assert.deepEqual(reqs.map((r) => [r.kind, r.text]), [
    ["responsibility", "Secure our cloud"],
    ["must", "3-5+ years of Python"],
    ["must", "Terraform"],
    ["nice", "Go"],
  ])
  assert.equal(reqs[1].years, 3)
})

test("cover letter decision", () => {
  assert.equal(coverLetterDecision("Please send your CV and a cover letter.").decision, "required")
  assert.equal(coverLetterDecision("Lettre de motivation facultative.").decision, "optional")
  assert.equal(coverLetterDecision("No cover letter needed, just your resume.").decision, "not_requested")
  assert.equal(coverLetterDecision("Apply with your resume.").decision, "not_mentioned")
})

test("reads the Apple posting's plain qualification lines without taking its prose footer", () => {
  const minimum = [
    "Strong analytical mindset with excellent attention to detail",
    "Solid planning and project management skills",
    "Ability to work with editorial style guides and content management systems",
    "A genuine interest in apps, games, and digital trends",
    "Currently enrolled in a Master’s degree program in Business, Marketing, Digital Strategy, or Project Management",
    "Eligibility to work in Paris for the 6 month internship",
  ]
  const preferred = [
    "Curiosity and eagerness to learn, with a proactive attitude",
    "Ability to balance multiple projects in a fast-moving environment",
    "Strong interpersonal skills and good at managing relationships",
  ]
  const posting = [
    "Description", "You will help curate editorial content.",
    "Minimum Qualifications", ...minimum,
    "Preferred Qualifications", ...preferred,
    "At Apple, we're not all the same. And that's our greatest strength. We work with applicants to make reasonable accommodations.",
  ].join("\n")
  const requirements = extractRequirements(posting)
  assert.deepEqual(requirements.filter((r) => r.kind === "must").map((r) => r.text), minimum)
  assert.deepEqual(requirements.filter((r) => r.kind === "nice").map((r) => r.text), preferred)
  assert.equal(requirements.length, 9)
})

test("an analysis with nothing to score leaves the fit score empty", () => {
  assert.equal(analyze([], [], "").fitScore, null)
})

test("coursework satisfies knowledge requirements but not hands-on ones", () => {
  const school = indexFacts([fact("s1", "Courses cover incident response and compliance.", "Télécom Paris", { entryKind: "education" })])
  assert.equal(matchRequirement(req("Participate in Incident Response and Compliance activities"), school).status, "partial")
  assert.equal(matchRequirement(req("Understanding of incident response and compliance"), school).status, "met")
  assert.deepEqual(keywordsIn("Our Spring offsite"), [])
})

test("works outside tech: tools, acronyms and plain words", async () => {
  const { extractRequirements } = await import("../../analysis/requirements")
  const nurse = indexFacts([
    fact("n1", "Documented care for 30 patients per shift in Epic.", "Hospital", { entryKind: "experience" }),
    fact("n2", "Holds a valid BLS certification.", "Red Cross", { entryKind: "certification" }),
  ])
  const reqs = extractRequirements("Requirements\n- Experience with EHR systems such as Epic\n- BLS certification\n- Experience with ServiceNow\n- Work with our Lyon team")
  const status = reqs.map((r) => matchRequirement(r, nurse).status)
  assert.deepEqual(status, ["met", "met", "gap", "judgement"])
})

test("related skills make a missing skill partly shown, never proven", () => {
  const m = matchRequirement(req("Experience operating within an SDLC program"), facts)
  assert.equal(m.status, "partial")
  assert.deepEqual(m.factIds, ["f2"])
  assert.match(m.note, /related evidence: CI\/CD, SAST, DAST/)
})

test("named tools need a fact that names them", () => {
  const data = indexFacts([fact("d1", "Built KPI dashboards for the sales team.", "Acme")])
  const vague = matchRequirement(req("Power BI or Tableau a plus", "nice"), data)
  assert.equal(vague.status, "partial")
  const named = indexFacts([fact("d2", "Built Power BI dashboards for the sales team.", "Acme")])
  assert.equal(matchRequirement(req("Power BI or Tableau a plus", "nice"), named).status, "met")
  assert.equal(matchRequirement(req("Experience building dashboards", "nice"), data).status, "met")
})

test("a posting flattened into one line still yields its requirements", async () => {
  const { extractRequirementCandidates } = await import("../../analysis/requirements")
  const flat = "We build security products for companies of every size and we are growing fast across Europe with a strong engineering culture and a lot of autonomy for every engineer on the team. ### Your missions: Build our foundations - Harden our Kubernetes clusters. - Secure our CI/CD pipelines. Grow our culture - Deliver security training. ### Your profile: 🤩 We are excited to meet you if: - You have 3+ years of security engineering experience. - You have experience implementing SAST and DAST. - You know Python well. 👀 Interested? Apply now."
  const result = extractRequirementCandidates(flat)
  const texts = result.requirements.map((r) => r.text)
  assert.ok(texts.some((t) => /3\+ years of security engineering/.test(t)))
  assert.ok(texts.some((t) => /SAST and DAST/.test(t)))
  assert.ok(result.candidates.length >= 6)
})
