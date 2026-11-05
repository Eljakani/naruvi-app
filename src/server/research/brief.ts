/**
 * Turn extracted pages into a sourced company brief, plus prompts that help
 * the candidate write their own "why this company". Pure.
 */
import { parseJobText } from "@/lib/job-text"
import { classifySentences, type PageFacts } from "./extract"

export type Sourced = { text: string; source: string }
export type CompanyResearch = {
  version: 1
  company: string
  website: string
  generatedAt: string
  about: Sourced[]
  mission: Sourced[]
  values: Sourced[]
  facts: { label: string; value: string; source: string }[]
  sources: { url: string; title: string }[]
  prompts: string[]
  starters: string[]
  notes: string[]
}

const POSTING = "job posting"

/** "About {company}" / "À propos" sections of the job posting itself. */
export function postingAbout(jobText: string, company: string): string[] {
  const blocks = parseJobText(jobText)
  const out: string[] = []
  let inAbout = false
  for (const block of blocks) {
    if (block.type === "heading") {
      inAbout = /\b(about|à propos|a propos|who we are|qui sommes|our company|l'entreprise|the company|sobre|über uns)\b/i.test(block.text) && !/\b(role|job|position|poste|you|vous)\b/i.test(block.text)
      continue
    }
    if (inAbout && block.type === "paragraph") out.push(block.text)
  }
  if (!out.length) {
    const first = blocks.find((block) => block.type === "paragraph" && company && block.text.toLowerCase().includes(company.toLowerCase()))
    if (first?.type === "paragraph") out.push(first.text)
  }
  return out.slice(0, 3)
}

const short = (text: string, max = 140) => (text.length > max ? `${text.slice(0, max).replace(/\s+\S*$/, "")}…` : text)
/** For quoting inside a sentence: drop the quote's own final period. */
const quote = (text: string, max = 140) => short(text, max).replace(/[.!]$/, "")

const PROMPTS = {
  en: {
    mission: (m: string) => `Their mission: “${quote(m)}”. What about it matters to you personally?`,
    values: (v: string) => `They say they value ${v}. Which of these already shows in how you work, and where?`,
    about: (a: string) => `What they do: “${quote(a)}”. Have you used it, or solved a similar problem?`,
    generic: (c: string) => `What would you be proud to tell a friend about working at ${c}?`,
    starters: (c: string) => [`What draws me to ${c} is `, `${c}'s focus on … resonates with me because `, `Having worked on …, I'd like to bring that experience to ${c} because `],
  },
  fr: {
    mission: (m: string) => `Leur mission : « ${quote(m)} ». Qu'est-ce qui vous parle personnellement ?`,
    values: (v: string) => `Leurs valeurs : ${v}. Laquelle se voit déjà dans votre façon de travailler, et où ?`,
    about: (a: string) => `Ce qu'ils font : « ${quote(a)} ». L'avez-vous utilisé, ou résolu un problème proche ?`,
    generic: (c: string) => `Qu'est-ce qui vous rendrait fier·ère de dire que vous travaillez chez ${c} ?`,
    starters: (c: string) => [`Ce qui m'attire chez ${c}, c'est `, `L'importance que ${c} accorde à … me parle, car `, `Après avoir travaillé sur …, je souhaite mettre cette expérience au service de ${c}, car `],
  },
}

/**
 * Prompts and sentence starters in a given language. Facts are language-
 * neutral and cached on the company; prompts follow the document being written.
 */
export function promptsFor(brief: Pick<CompanyResearch, "company" | "mission" | "values" | "about">, language: string) {
  const p = PROMPTS[language as keyof typeof PROMPTS] ?? PROMPTS.en
  const prompts: string[] = []
  if (brief.mission[0]) prompts.push(p.mission(brief.mission[0].text))
  if (brief.values.length) prompts.push(p.values(brief.values.slice(0, 3).map((v) => v.text).join(", ")))
  if (brief.about[0]) prompts.push(p.about(brief.about[0].text))
  prompts.push(p.generic(brief.company))
  return { prompts, starters: p.starters(brief.company) }
}

export function buildBrief(input: { company: string; website: string; pages: PageFacts[]; jobText: string; language: string; now?: Date; notes?: string[] }): CompanyResearch {
  const { company, pages } = input
  const about: Sourced[] = []
  const mission: Sourced[] = []
  const values: Sourced[] = []
  const facts: CompanyResearch["facts"] = []
  const seen: string[] = []
  const norm = (text: string) => text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim()
  const add = (list: Sourced[], text: string, source: string, max: number) => {
    const key = norm(text)
    // Near-duplicates (a heading glued in front, a longer variant) count once.
    if (!text || list.length >= max || seen.some((other) => other.includes(key.slice(0, 60)) || key.includes(other.slice(0, 60)))) return
    seen.push(key)
    list.push({ text, source })
  }

  // Recruiting sentences describe the candidate, not the company.
  const RECRUITING = /\b(we(?:'re| are) looking|looking for|you will|you'll|your role|the ideal candidate|join us|we(?:'re| are) hiring|nous recherchons|vous (?:serez|allez|êtes)|rejoignez)\b/i
  for (const paragraph of postingAbout(input.jobText, company)) {
    const missions = classifySentences(paragraph, company).filter((m) => m.kind === "mission")
    for (const statement of missions) add(mission, statement.text, POSTING, 3)
    const rest = paragraph
      .split(/(?<=[.!?])\s+/)
      .filter((sentence) => !missions.some((m) => m.text === sentence.trim()) && !RECRUITING.test(sentence))
      .join(" ")
      .trim()
    if (rest.length >= 40) add(about, short(rest, 420), POSTING, 3)
  }
  for (const page of pages) {
    if (page.organization?.description) add(about, short(page.organization.description, 420), page.url, 3)
    for (const statement of page.statements) {
      if (statement.kind === "mission") add(mission, statement.text, page.url, 3)
      else if (statement.kind === "about") add(about, statement.text, page.url, 3)
    }
    for (const value of page.values) add(values, value, page.url, 6)
  }

  const fact = (label: string, value: string | undefined, source: string) => {
    if (value && !facts.some((f) => f.label === label)) facts.push({ label, value, source })
  }
  for (const page of pages) {
    const org = page.organization
    if (org) {
      fact("Founded", org.foundingDate, page.url)
      fact("Size", org.employees ? `${org.employees} employees` : undefined, page.url)
      fact("Locations", org.locations?.length ? org.locations.slice(0, 4).join(" · ") : undefined, page.url)
      fact("Tagline", org.slogan, page.url)
    }
    for (const statement of page.statements) {
      if (statement.kind === "founded") fact("Founded", statement.text.match(/(19|20)\d{2}/)?.[0], page.url)
      if (statement.kind === "scale") fact("Scale", short(statement.text, 160), page.url)
    }
  }

  const { prompts, starters } = promptsFor({ company, mission, values, about }, input.language)

  return {
    version: 1,
    company,
    website: input.website,
    generatedAt: (input.now ?? new Date()).toISOString(),
    about,
    mission,
    values,
    facts,
    sources: pages.map((page) => ({ url: page.url, title: page.title || page.url })),
    prompts,
    starters,
    notes: input.notes ?? [],
  }
}
