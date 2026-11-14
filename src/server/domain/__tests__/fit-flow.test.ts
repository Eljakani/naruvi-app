import assert from "node:assert/strict"
import { test } from "node:test"
import { isAttitude, settleAttitude, type RequirementMatch } from "../../analysis/match"
import { extractRequirementCandidates, isJobCondition } from "../../analysis/requirements"
import { researchForPosting, type CompanyResearch } from "../../research/brief"
import { decodeEntities, extractJobLeads } from "../../../lib/job-alerts"
import { decideMatches } from "../../analysis/refine"
import { decideInChunks, type Decide, type DecisionResult } from "../../decisions/jev"
import { groundedFields, postingHeader } from "../../jobs/ai-extract"
import { parseJobDocument } from "../../jobs/vendor/job-parser.js"

const page = (title: string, body: string) => `<html><head><title>${title}</title></head><body><nav>Teams · Locations</nav>${body}</body></html>`
const text = "Platform engineers at Acme Robotics design and run the systems behind our fleet. You will own services end to end, write Go, and work with the hardware team every week. ".repeat(3)

test("page title: the pipe separates the site, a dash before it stays in the role", () => {
  const job = parseJobDocument({ html: page("Senior Software Engineer - Distributed Systems | Acme Robotics Careers", `<main><p>${text}</p></main>`), url: "https://careers.acme-robotics.example/detail/1" }) as { role: string; company: string }
  assert.equal(job.role, "Senior Software Engineer - Distributed Systems")
  assert.equal(job.company, "Acme Robotics")
  const reversed = parseJobDocument({ html: page("Acme Robotics | Backend Engineer", `<main><p>${text}</p></main>`), url: "https://jobs.acme-robotics.example/2" }) as { role: string; company: string }
  assert.equal(reversed.role, "Backend Engineer")
  assert.equal(reversed.company, "Acme Robotics")
})

test("posting header: the title and the lines just above the description, so a model can ground role and location", () => {
  const html = page("Senior Software Engineer - Distributed Systems | Acme Careers", `<h2>Senior Software Engineer - Distributed Systems</h2><p>Lyon, France</p><main><p>${text}</p></main><script>var x = "Paris"</script>`)
  const header = postingHeader(html, text)
  assert.match(header, /^Senior Software Engineer - Distributed Systems \| Acme Careers\n/)
  assert.match(header, /Lyon, France$/)
  assert.ok(!header.includes("Platform engineers"), "stops where the description starts")
  assert.ok(!header.includes("Paris"), "scripts are not page text")
  const fields = groundedFields({ role: "Senior Software Engineer - Distributed Systems", company: "", location: "Lyon, France", remote: "", employmentType: "", salary: "", language: "en" }, `${header}\n${text}`)
  assert.equal(fields.location, "Lyon, France")
  assert.equal(postingHeader("", text), "")
})

test("attitudes are the person's call, unless the sentence also asks for experience", () => {
  for (const line of ["You care about simple designs and performance", "You’re excited about leveraging AI tools to enhance how you code", "Own meaningful parts of our service, have an impact, grow with the company", "Vous aimez travailler en équipe", "Bonus: You're motivated to push the boundaries"]) assert.ok(isAttitude(line), line)
  for (const line of ["You have 3+ years of experience with Go", "You are passionate about Kubernetes and have proven experience running clusters", "Build fault-tolerant, horizontally scalable solutions", "Maîtrise de Terraform"]) assert.ok(!isAttitude(line), line)
  const match = { id: "r1", text: "You care about simple designs", kind: "must", section: "", keywords: [], years: null, status: "met", factIds: ["f1"], covered: [], missing: [], note: "", source: "model" } as RequirementMatch
  const settled = settleAttitude(match)
  assert.equal(settled.status, "judgement")
  assert.deepEqual(settled.factIds, ["f1"], "related facts stay as talking material")
})

const result = (answers: DecisionResult["answers"]): DecisionResult => ({ model: "jev-test", answers, usage: { input_tokens: 10, output_tokens: 1 } })
const rule = (id: string, status: RequirementMatch["status"], note: string, missing: string[] = []): RequirementMatch => ({ id, text: `requirement ${id}`, kind: "must", section: "", keywords: [], years: null, status, factIds: [], covered: [], missing, note, source: "rules" })

test("decision review: raising to proven takes confidence and support; a changed status drops the stale rule note", async () => {
  const matches = [rule("r1", "judgement", "Not something facts can prove (soft skill or context)."), rule("r2", "gap", "Nothing in your verified profile mentions BS. Don't claim it."), rule("r3", "partial", "No fact mentions Rust.", ["Rust"])]
  const catalog = [{ id: "f1", statement: "Built a Go service", entry: "Acme", kind: "experience" }]
  const decide: Decide = async () => result({
    status_r1: { type: "choice", choice: "met", confidence: 0.5, probabilities: { met: 0.6 } },
    fact_r1: { type: "choice", choice: "F1", confidence: 0.4, probabilities: { F1: 0.4, none: 0.2 } },
    status_r2: { type: "choice", choice: "met", confidence: 0.95, probabilities: { met: 0.97 } },
    fact_r2: { type: "choice", choice: "F1", confidence: 0.9, probabilities: { F1: 0.9, none: 0.05 } },
    status_r3: { type: "choice", choice: "met", confidence: 0.9, probabilities: { met: 0.9 } },
    fact_r3: { type: "choice", choice: "F1", confidence: 0.3, probabilities: { F1: 0.3, none: 0.7 } },
  })
  const by = Object.fromEntries((await decideMatches(matches, catalog, decide)).matches.map((match) => [match.id, match]))
  assert.equal(by.r1.status, "partial", "an unsure 'met' is only partly proven")
  assert.ok(!/soft skill/.test(by.r1.note), "the rule note no longer fits")
  assert.equal(by.r2.status, "met")
  assert.equal(by.r2.note, "", "a proven line never says 'don't claim it'")
  assert.equal(by.r3.status, "partial", "confident, but the facts barely carry it")
})

test("decision chunks run a few at a time and merge every answer", async () => {
  let running = 0
  let peak = 0
  const decide: Decide = async (_state, questions) => {
    running += 1
    peak = Math.max(peak, running)
    await new Promise((resolve) => setTimeout(resolve, 5))
    running -= 1
    return result(Object.fromEntries(Object.keys(questions).map((id) => [id, { type: "noul" as const, noul: 1 }])))
  }
  const questions = Object.fromEntries(Array.from({ length: 10 }, (_, index) => [`q${index}`, { type: "noul" as const, instructions: "x" }]))
  const merged = await decideInChunks(decide, "s", questions, 2)
  assert.equal(Object.keys(merged.answers).length, 10)
  assert.equal(merged.usage.input_tokens, 50)
  assert.ok(peak > 1 && peak <= 3, `peak ${peak}`)
})

test("conditions of the job are not skills to prove", () => {
  for (const line of ["Targeting a 2027 full-time start date", "Eligible to work in France without visa sponsorship", "Disponible à partir de septembre", "Based in Paris or willing to relocate"]) assert.ok(isJobCondition(line), line)
  for (const line of ["High availability systems with Kubernetes", "3 years of experience, available immediately", "Design relocation-safe storage in Go"]) assert.ok(!isJobCondition(line), line)
  const extraction = extractRequirementCandidates("### Who You Are\n- You write Go services\n- Targeting a 2027 full-time start date\n")
  assert.deepEqual(extraction.requirements.map((item) => item.text), ["You write Go services"])
  assert.equal(extraction.excluded[0]?.category, "job_conditions")
})

test("the title decides the contract before a passing mention in the text", () => {
  const html = page("Software Engineering Intern | Acme Robotics Careers", `<main><p>${text} Targeting a 2027 full-time start date.</p></main>`)
  assert.equal((parseJobDocument({ html, url: "https://careers.acme-robotics.example/3" }) as { employmentType: string }).employmentType, "Internship")
})

test("lead titles keep no HTML entities", () => {
  assert.equal(decodeEntities("Infra Engineer Acme &middot; Paris &amp; Lyon &#8211; d&eacute;butant &unknown;"), "Infra Engineer Acme · Paris & Lyon – débutant &unknown;")
  const [lead] = extractJobLeads('<a href="https://www.linkedin.com/jobs/view/1234567/">Infra Engineer Acme &middot; Paris</a>', "")
  assert.equal(lead.title, "Infra Engineer Acme · Paris")
})

test("company research leaves out what came from another posting", () => {
  const research = {
    version: 1, company: "Acme", website: "https://acme.example", generatedAt: "", facts: [], sources: [], prompts: [], starters: [], notes: [], values: [],
    about: [{ text: "Acme builds robots.", source: "https://acme.example/about" }, { text: "The fleet team runs the platform.", source: "job posting" }],
    mission: [],
    angles: [{ text: "Fleet engineers write Go.", sources: ["https://careers.acme.example/1"] }, { text: "Acme ships to 40 countries.", sources: ["https://acme.example/about"] }],
    postingJobId: "job-1",
  } as CompanyResearch
  const other = researchForPosting(research, "job-2", ["https://careers.acme.example/1/"])
  assert.deepEqual(other.angles?.map((angle) => angle.text), ["Acme ships to 40 countries."])
  assert.deepEqual(other.about.map((item) => item.text), ["Acme builds robots."])
  assert.equal(researchForPosting(research, "job-1", []).angles?.length, 2, "its own posting keeps everything")
  assert.equal(researchForPosting(null, "job-2", []), null)
})
