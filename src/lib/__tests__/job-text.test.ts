import assert from "node:assert/strict"
import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import test from "node:test"
import { inlineParts, normalizeText, parseJobText } from "../job-text"

const kinds = (text: string) => parseJobText(text).map((block) => block.type)

test("blank lines between bullets still make one list", () => {
  const blocks = parseJobText("At Dashlane you will\n\n- Help drive security\n\n- Assist with reviews\n\n \nWe're looking for:\n\n- Familiarity with AppSec")
  assert.deepEqual(blocks.map((b) => b.type), ["heading", "list", "heading", "list"])
  assert.deepEqual(blocks[1], { type: "list", ordered: false, items: ["Help drive security", "Assist with reviews"] })
  assert.equal(blocks[2].type === "heading" && blocks[2].text, "We're looking for")
})

test("recognises many bullet and heading styles", () => {
  const text = `ABOUT THE ROLE
You will secure our cloud.
## Requirements
• 3+ years of Python
• Kubernetes in production
**Nice to have**
1. Terraform
2) Go
Benefits:
a) Remote
b) Equity`
  assert.deepEqual(kinds(text), ["heading", "paragraph", "heading", "list", "heading", "list", "heading", "list"])
  const lists = parseJobText(text).filter((b) => b.type === "list")
  assert.deepEqual(lists.map((l) => l.type === "list" && l.ordered), [false, true, false])
})

test("joins hard-wrapped paragraphs and bullet continuations", () => {
  const blocks = parseJobText("We build tools that help\nteams ship safely.\nYou will join a small team.\n- Own the CI/CD security\n  pipeline end to end")
  assert.deepEqual(blocks[0], { type: "paragraph", text: "We build tools that help teams ship safely." })
  assert.deepEqual(blocks[1], { type: "paragraph", text: "You will join a small team." })
  assert.deepEqual(blocks[2], { type: "list", ordered: false, items: ["Own the CI/CD security pipeline end to end"] })
})

test("a wall of text stays readable paragraphs, short sentences are not headings", () => {
  assert.deepEqual(kinds("We are hiring. Join us.\n\nApply now."), ["paragraph", "paragraph"])
  assert.deepEqual(kinds("Remote"), ["paragraph"])
})

test("cleans spacing artefacts and invisible characters", () => {
  assert.equal(normalizeText("Dashlane , including how we work​ ."), "Dashlane, including how we work.")
})

test("inline parts find bold, links and e-mails without swallowing punctuation", () => {
  assert.deepEqual(inlineParts("See **benefits** at https://acme.com/jobs. Mail jobs@acme.com!"), [
    { type: "text", value: "See " },
    { type: "bold", value: "benefits" },
    { type: "text", value: " at " },
    { type: "link", value: "https://acme.com/jobs" },
    { type: "text", value: ". Mail " },
    { type: "email", value: "jobs@acme.com" },
    { type: "text", value: "!" },
  ])
})

test("real postings parse into structured sections", async () => {
  const { parseSource, pickBest } = await import("../../server/jobs/select")
  const root = join(process.cwd(), "evals/jobs/fixtures")
  for (const name of readdirSync(root)) {
    const fixture = JSON.parse(readFileSync(join(root, name, "fixture.json"), "utf8"))
    const job = pickBest(fixture.sources.map((s: { kind: string; file: string }) => parseSource(s.kind, readFileSync(join(root, name, s.file), "utf8"), s.file.endsWith(".json") ? "application/json" : "text/html", fixture.url)))!
    const blocks = parseJobText(job.description)
    const headings = blocks.filter((b) => b.type === "heading").length
    const items = blocks.flatMap((b) => (b.type === "list" ? b.items : []))
    assert.ok(headings >= 2, `${name}: expected sections, got ${headings}`)
    assert.ok(items.length >= 3, `${name}: expected bullet lists, got ${items.length} items`)
    assert.ok(items.every((item) => item.length > 1), `${name}: empty bullet`)
    assert.ok(blocks.every((b) => b.type !== "heading" || b.text.length <= 80), `${name}: oversized heading`)
  }
})

test("a bullet marker alone on its line joins the next line", () => {
  assert.deepEqual(parseJobText("You will\n\n-\nHelp drive security\n\n-\nAssist reviews"), [
    { type: "heading", text: "You will", id: "you-will" },
    { type: "list", ordered: false, items: ["Help drive security", "Assist reviews"] },
  ])
})

test("leadLabel splits short labels only", async () => {
  const { leadLabel } = await import("../job-text")
  assert.deepEqual(leadLabel("Mentoring: You enjoy helping others."), { label: "Mentoring", rest: "You enjoy helping others." })
  assert.deepEqual(leadLabel("Flex Benefits - monthly amount for benefits"), { label: "Flex Benefits", rest: "monthly amount for benefits" })
  assert.equal(leadLabel("Experience operating within an SDLC program"), null)
  assert.equal(leadLabel("You will build pipelines that are secure: from code to cloud"), null)
  assert.equal(leadLabel("Read more at https://acme.com: here"), null)
})
