import assert from "node:assert/strict"
import test from "node:test"
import { parseJobText } from "../../../lib/job-text"
import { extractRequirementCandidates, extractRequirements, isVagueLine } from "../../analysis/requirements"

const texts = (posting: string) => extractRequirementCandidates(posting).requirements.map((item) => item.text)

test("emoji-decorated headings are read as headings", () => {
  const blocks = parseJobText("🎯 Your profile\n- 5+ years of experience with Go\n\nNice to have ✨\n- Kubernetes\n\n🎁 What we offer\n- Free lunch")
  assert.deepEqual(blocks.filter((block) => block.type === "heading").map((block) => block.type === "heading" && block.text), ["Your profile", "Nice to have", "What we offer"])
  const extraction = extractRequirementCandidates("🎯 Your profile\n- 5+ years of experience with Go\n\n✨ Nice to have ✨\n- Kubernetes\n\n🎁 What we offer\n- A great office")
  assert.deepEqual(extraction.requirements.map((item) => [item.text, item.kind]), [["5+ years of experience with Go", "must"], ["Kubernetes", "nice"]])
})

test("the same emoji starting each line is a bullet", () => {
  assert.deepEqual(texts("Requirements\n✅ Python\n✅ Docker\n✅ Fluent English"), ["Python", "Docker", "Fluent English"])
})

test("short requirement lines without bullets are kept", () => {
  assert.deepEqual(texts("Requirements\nPython\nDocker and Kubernetes\n3+ years of backend work\n\nBenefits\nFree lunch"), ["Python", "Docker and Kubernetes", "3+ years of backend work"])
  assert.deepEqual(texts("Requirements\n\nPython\n\nFluent English"), ["Python", "Fluent English"])
  // A hard-wrapped paragraph is still one paragraph.
  const wrapped = parseJobText("About the role\nWe are a small team building tools for\nlogistics companies across Europe.")
  assert.equal(wrapped.filter((block) => block.type === "paragraph").length, 1)
})

test("German, Spanish, Italian, Portuguese and Dutch sections are classified", () => {
  const cases: [string, string][] = [
    ["Ihr Profil\n- Erfahrung mit Python\n\nWas wir bieten\n- Firmenwagen", "Erfahrung mit Python"],
    ["Requisitos\n- Experiencia con React\n\nOfrecemos\n- Seguro médico", "Experiencia con React"],
    ["Il tuo profilo\n- Esperienza con Java\n\nCosa offriamo\n- Buoni pasto", "Esperienza con Java"],
    ["Requisitos\n- Experiência com SQL\n\nOferecemos\n- Vale refeição", "Experiência com SQL"],
    ["Wat wij vragen\n- Ervaring met TypeScript\n\nWat wij bieden\n- Leaseauto", "Ervaring met TypeScript"],
  ]
  for (const [posting, expected] of cases) assert.deepEqual(texts(posting), [expected], posting)
  const extraction = extractRequirementCandidates("Deine Aufgaben\n- APIs entwickeln\n\nDas bringst du mit\n- 3 Jahre Erfahrung mit Go\n- Kubernetes von Vorteil")
  assert.deepEqual(extraction.requirements.map((item) => [item.kind, item.years]), [["responsibility", null], ["must", 3], ["nice", null]])
})

test("vague lines inside a requirements list are excluded", () => {
  const extraction = extractRequirementCandidates("Requirements\n- 5 years of experience with Python\n- Passionate and curious\n- Team player\n- Strong written communication\n- Good vibes only!\n- etc.")
  assert.deepEqual(extraction.requirements.map((item) => item.text), ["5 years of experience with Python", "Strong written communication"])
  assert.equal(extraction.excluded.filter((item) => item.category === "vague").length, 4)
  assert.equal(isVagueLine("Motivé et dynamique"), true)
  assert.equal(isVagueLine("Passionate about distributed systems"), false)
  assert.equal(isVagueLine("Eager to learn Rust"), false)
})

test("a scraped page: button text, one item per line without periods, and a section shown twice", () => {
  const profile = [
    "Tu es diplômé·e d’une école d’ingénieur",
    "Tu as entre 1 et 3 ans d'expérience",
    "Tu aimes travailler en équipe (revues de code, pair programming)",
    "Tu souhaites progresser dans un environnement exigeant",
  ].join("\n")
  const text = [
    "Chez Exemplo, nous construisons des produits numériques.",
    "",
    "Voir plus",
    "Vos missions au quotidien",
    "L’histoire du groupe Exemplo",
    "",
    "Exemplo accompagne des entreprises depuis 2010.",
    "",
    "Tes missions :",
    "",
    "Écrire du code testé et maintenable",
    "Analyser les problèmes en profondeur",
    "Travailler avec un LLM pour accélérer les développements",
    "",
    "Profil recherché :",
    "",
    "Nous cherchons des potentiels.",
    "",
    profile,
    "",
    "Ce que l’on cherche",
    profile,
  ].join("\n")
  const texts = extractRequirements(text).map((item) => item.text)
  // Each line is its own requirement, listed once; the page's button and the company's history are not requirements.
  assert.deepEqual(texts.filter((item) => item.startsWith("Tu ")), profile.split("\n"))
  assert.ok(texts.includes("Analyser les problèmes en profondeur"))
  assert.ok(texts.includes("Travailler avec un LLM pour accélérer les développements"))
  assert.ok(!texts.some((item) => /Voir plus|Vos missions au quotidien|L’histoire/.test(item)), texts.join(" | "))
  // "Tu souhaites…" is the candidate's wish, not a nice-to-have.
  assert.equal(extractRequirements(text).find((item) => item.text.startsWith("Tu souhaites"))?.kind, "must")
})
