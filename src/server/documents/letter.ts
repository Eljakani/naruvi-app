/**
 * Cover letter model + composer. Pure.
 *
 * Three kinds of content, never mixed up:
 *  - "evidence": the user's approved, fact-backed bullets for proven
 *    requirements (cited by fact id);
 *  - "template": localized standard wording that names the company/role and
 *    claims nothing about the candidate;
 *  - "placeholder": what only the candidate can say (why this company). The
 *    quality gate refuses "ready" until every placeholder is replaced.
 */
import { z } from "zod"
import { aiAssistance, aiReviewCheck } from "./ai-metadata"
import { templateIds } from "./model"
import { designTokens } from "@/lib/design"
import type { ComposeAnalysis, ComposeEntry, ComposeProfile } from "./compose"

export const letterParagraph = z.object({
  originalText: z.string().max(3000).optional(),
  factIds: z.array(z.string()).optional(),
  sourceUrls: z.array(z.string()).optional(),
  id: z.string(),
  kind: z.enum(["opening", "highlights", "motivation", "closing", "custom"]),
  text: z.string().max(3000).default(""),
  /** True while the text still asks the user to write something. */
  placeholder: z.boolean().default(false),
  included: z.boolean().default(true),
})

export const letterHighlight = z.object({
  originalText: z.string().max(600).optional(),
  id: z.string(),
  text: z.string().max(600),
  organization: z.string().default(""),
  factIds: z.array(z.string()).default([]),
  included: z.boolean().default(true),
})

export const letterDocument = z.object({
  authorNotes: z.string().max(1500).default(""),
  aiAssistance: aiAssistance.optional(),
  version: z.literal(1),
  kind: z.literal("cover_letter"),
  language: z.string().regex(/^[a-z]{2}$/),
  template: z.enum(templateIds).catch("classic").default("classic"),
  design: designTokens.optional(),
  templateRef: z.string().uuid().optional(),
  accent: z.string().regex(/^#[0-9a-f]{6}$/i).default("#2563eb"),
  header: z.object({
    name: z.string(),
    headline: z.string().default(""),
    photoPath: z.string().nullable().default(null),
    email: z.string().default(""),
    phone: z.string().default(""),
    location: z.string().default(""),
    links: z.array(z.object({ label: z.string(), url: z.string() })).default([]),
  }),
  recipient: z.object({ company: z.string(), location: z.string().default("") }),
  date: z.string(),
  subject: z.string(),
  salutation: z.string(),
  paragraphs: z.array(letterParagraph),
  highlightsIntro: z.string().default(""),
  highlights: z.array(letterHighlight).default([]),
  signoff: z.string(),
})

export type LetterDocument = z.infer<typeof letterDocument>

type Phrases = {
  subject: (role: string) => string
  salutation: (company: string) => string
  opening: (role: string, company: string) => string
  highlightsIntro: string
  motivation: (company: string) => string
  /** A complete, honest motivation when no AI is available: interest in what the role involves, no invented history. */
  interest: (role: string, company: string, focus: string) => string
  closing: string
  signoff: string
  date: (d: Date) => string
}

const fmt = (locale: string) => (d: Date) => d.toLocaleDateString(locale, { day: "numeric", month: "long", year: "numeric" })

export const LETTER_PHRASES: Record<string, Phrases> = {
  en: {
    subject: (role) => `Application for the ${role} position`,
    salutation: (company) => `Dear ${company} hiring team,`,
    opening: (role, company) => `I am writing to apply for the ${role} position at ${company}.`,
    highlightsIntro: "Relevant highlights from my experience:",
    motivation: (company) => `[Why ${company}? In 2–3 sentences of your own, say what draws you to this team, product or mission. Only you can write this part.]`,
    interest: (role, company, focus) => focus ? `What draws me to the ${role} role at ${company} is what it involves day to day: ${focus}. It is the kind of work I want to keep growing in, and I would bring the same care to your team.` : `The ${role} role at ${company} matches the responsibilities I want to take on next, and I would bring the same care to your team.`,
    closing: "I would welcome the opportunity to discuss how I can contribute to your team. Thank you for your time and consideration.",
    signoff: "Kind regards,",
    date: fmt("en-GB"),
  },
  fr: {
    subject: (role) => `Candidature au poste de ${role}`,
    salutation: () => "Madame, Monsieur,",
    opening: (role, company) => `Je vous adresse ma candidature au poste de ${role} au sein de ${company}.`,
    highlightsIntro: "Quelques réalisations en lien avec le poste :",
    motivation: (company) => `[Pourquoi ${company} ? En 2 à 3 phrases, avec vos propres mots, expliquez ce qui vous attire dans cette équipe, ce produit ou cette mission. Vous seul pouvez écrire cette partie.]`,
    interest: (role, company, focus) => focus ? `Ce qui m’attire dans le poste de ${role} chez ${company}, c’est ce qu’il implique au quotidien : ${focus}. C’est le type de mission dans laquelle je souhaite continuer à progresser, et j’y apporterai le même engagement au sein de votre équipe.` : `Le poste de ${role} chez ${company} correspond aux responsabilités que je souhaite prendre, et j’y apporterai le même engagement au sein de votre équipe.`,
    closing: "Je me tiens à votre disposition pour un entretien afin d’échanger sur ma contribution possible à votre équipe. Je vous remercie pour votre attention.",
    signoff: "Je vous prie d’agréer, Madame, Monsieur, l’expression de mes salutations distinguées.",
    date: fmt("fr-FR"),
  },
  es: {
    subject: (role) => `Candidatura al puesto de ${role}`,
    salutation: (company) => `Estimado equipo de selección de ${company}:`,
    opening: (role, company) => `Les escribo para presentar mi candidatura al puesto de ${role} en ${company}.`,
    highlightsIntro: "Logros relevantes de mi experiencia:",
    motivation: (company) => `[¿Por qué ${company}? En 2–3 frases propias, explique qué le atrae de este equipo, producto o misión. Solo usted puede escribir esta parte.]`,
    interest: (role, company, focus) => focus ? `Lo que me atrae del puesto de ${role} en ${company} es lo que implica en el día a día: ${focus}. Es el tipo de trabajo en el que quiero seguir creciendo, y aportaría el mismo compromiso a su equipo.` : `El puesto de ${role} en ${company} encaja con las responsabilidades que quiero asumir, y aportaría el mismo compromiso a su equipo.`,
    closing: "Me encantaría tener la oportunidad de conversar sobre cómo puedo contribuir a su equipo. Gracias por su tiempo y consideración.",
    signoff: "Atentamente,",
    date: fmt("es-ES"),
  },
  de: {
    subject: (role) => `Bewerbung als ${role}`,
    salutation: () => "Sehr geehrte Damen und Herren,",
    opening: (role, company) => `hiermit bewerbe ich mich um die Position als ${role} bei ${company}.`,
    highlightsIntro: "Relevante Ergebnisse aus meiner Erfahrung:",
    motivation: (company) => `[Warum ${company}? Beschreiben Sie in 2–3 eigenen Sätzen, was Sie an diesem Team, Produkt oder dieser Mission reizt. Nur Sie können diesen Teil schreiben.]`,
    interest: (role, company, focus) => focus ? `An der Position als ${role} bei ${company} reizt mich besonders, was sie im Alltag umfasst: ${focus}. In genau diesem Bereich möchte ich mich weiterentwickeln und mich mit vollem Einsatz in Ihr Team einbringen.` : `Die Position als ${role} bei ${company} entspricht genau den Aufgaben, die ich als Nächstes übernehmen möchte, und ich würde mich mit vollem Einsatz in Ihr Team einbringen.`,
    closing: "Über die Gelegenheit zu einem persönlichen Gespräch freue ich mich sehr. Vielen Dank für Ihre Zeit.",
    signoff: "Mit freundlichen Grüßen",
    date: fmt("de-DE"),
  },
}

type Programme = { duration: string; start: string; rhythm: string }
/**
 * Apprenticeship, internship and other formats change how a letter opens:
 * "en alternance, au rythme de …", "a 6-month internship from …". Null falls
 * back to the plain opening.
 */
const FORMAT: Record<string, { subject: (role: string, contract?: string) => string | null; opening: (role: string, company: string, contract?: string, programme?: Programme) => string | null }> = {
  fr: {
    subject: (role, contract) => (contract === "apprenticeship" ? `Candidature en alternance au poste de ${role}` : contract === "internship" ? `Candidature pour un stage : ${role}` : null),
    opening: (role, company, contract, programme) => {
      const extras = [programme?.duration && `d’une durée de ${programme.duration}`, programme?.rhythm && `au rythme ${programme.rhythm}`, programme?.start && `à partir de ${programme.start}`].filter(Boolean).join(", ")
      if (contract === "apprenticeship") return `Je vous adresse ma candidature pour le poste de ${role} en alternance au sein de ${company}${extras ? `, ${extras}` : ""}.`
      if (contract === "internship") return `Je vous adresse ma candidature pour un stage de ${role} au sein de ${company}${extras ? `, ${extras}` : ""}.`
      if (contract === "freelance") return `Je vous propose ma candidature pour la mission de ${role} chez ${company}.`
      return null
    },
  },
  en: {
    subject: (role, contract) => (contract === "apprenticeship" ? `Application for the ${role} apprenticeship` : contract === "internship" ? `Application for the ${role} internship` : null),
    opening: (role, company, contract, programme) => {
      const extras = [programme?.duration && `for ${programme.duration}`, programme?.rhythm && `on a ${programme.rhythm} schedule`, programme?.start && `starting ${programme.start}`].filter(Boolean).join(", ")
      if (contract === "apprenticeship") return `I am writing to apply for the ${role} apprenticeship at ${company}${extras ? `, ${extras}` : ""}.`
      if (contract === "internship") return `I am writing to apply for the ${role} internship at ${company}${extras ? `, ${extras}` : ""}.`
      if (contract === "freelance") return `I would like to put myself forward for the ${role} mission at ${company}.`
      return null
    },
  },
  de: {
    subject: (role, contract) => (contract === "apprenticeship" ? `Bewerbung um einen Ausbildungsplatz als ${role}` : contract === "internship" ? `Bewerbung um ein Praktikum als ${role}` : contract === "student_job" ? `Bewerbung als Werkstudent: ${role}` : null),
    opening: (role, company, contract, programme) => {
      const extras = [programme?.duration && `für ${programme.duration}`, programme?.start && `ab ${programme.start}`].filter(Boolean).join(" ")
      if (contract === "apprenticeship") return `hiermit bewerbe ich mich um die Ausbildung als ${role} bei ${company}${extras ? ` ${extras}` : ""}.`
      if (contract === "internship") return `hiermit bewerbe ich mich um ein Praktikum als ${role} bei ${company}${extras ? ` ${extras}` : ""}.`
      if (contract === "student_job") return `hiermit bewerbe ich mich als Werkstudent für die Position ${role} bei ${company}.`
      return null
    },
  },
  es: {
    subject: (role, contract) => (contract === "apprenticeship" ? `Candidatura a la formación dual: ${role}` : contract === "internship" ? `Candidatura a prácticas: ${role}` : null),
    opening: (role, company, contract, programme) => {
      const extras = [programme?.duration && `de ${programme.duration}`, programme?.start && `a partir de ${programme.start}`].filter(Boolean).join(", ")
      if (contract === "apprenticeship") return `Les escribo para presentar mi candidatura a la formación dual de ${role} en ${company}${extras ? `, ${extras}` : ""}.`
      if (contract === "internship") return `Les escribo para presentar mi candidatura a las prácticas de ${role} en ${company}${extras ? `, ${extras}` : ""}.`
      return null
    },
  },
}

export function phrasesFor(language: string): Phrases {
  return LETTER_PHRASES[language] ?? LETTER_PHRASES.en
}

const clean = (text: string) => text.replace(/\*\*(.+?)\*\*/g, "$1").trim()

/** The first duty the posting lists, to follow a colon: short, lower-case start, no end punctuation. */
export function focusOf(analysis: { requirements: { kind: string; text?: string }[] } | null): string {
  const duty = analysis?.requirements.find((requirement) => requirement.kind === "responsibility" && requirement.text && requirement.text.length <= 140)?.text ?? ""
  if (!duty) return ""
  const trimmed = duty.replace(/[.;:!]+$/, "").trim()
  // Keep acronyms and names ("AWS", "GitLab") as written; lower-case an ordinary first word.
  return /^[A-ZÀ-Ý][a-zà-ÿ]/.test(trimmed) ? trimmed[0].toLowerCase() + trimmed.slice(1) : trimmed
}

export function composeLetter(
  profile: ComposeProfile,
  entries: ComposeEntry[],
  analysis: (ComposeAnalysis & { requirements: { kind: string; status: string; factIds: string[]; text?: string }[] }) | null,
  job: { title: string; company: string; location?: string; contract?: string; programme?: { duration: string; start: string; rhythm: string } },
  options: { language: string; today?: Date; maxHighlights?: number },
): LetterDocument {
  const { language } = options
  const p = phrasesFor(language)
  const verified = entries.filter((entry) => entry.status === "verified")

  // Highlights: for each proven must-have (then responsibilities), the user's
  // best approved bullet in this language that cites the evidence.
  const highlights: LetterDocument["highlights"] = []
  const used = new Set<string>()
  const ranked = options.maxHighlights === 0 ? [] : [...(analysis?.requirements ?? [])]
    .filter((r) => (r.status === "met" || r.status === "partial") && r.factIds.length)
    .sort((a, b) => Number(b.status === "met") - Number(a.status === "met") || Number(b.kind === "must") - Number(a.kind === "must"))
  for (const requirement of ranked) {
    for (const entry of verified) {
      const phrasing = entry.phrasings.find(
        (ph) => ph.role === "bullet" && ph.language === language && ph.grounding.grounded && !used.has(ph.id) && ph.factIds.some((id) => requirement.factIds.includes(id)),
      )
      if (!phrasing) continue
      used.add(phrasing.id)
      const display = entry.display[language] ?? entry.display.en ?? {}
      highlights.push({ id: phrasing.id, text: clean(phrasing.text), organization: display.organization ?? entry.title, factIds: phrasing.factIds, included: highlights.length < (options.maxHighlights ?? 3) })
      break
    }
    if (highlights.length >= 6) break
  }

  return {
    authorNotes: "",
    version: 1,
    kind: "cover_letter",
    language,
    template: "classic",
    accent: "#2563eb",
    header: { name: profile.fullName, headline: profile.headlines[language] ?? "", photoPath: profile.photoPath ?? null, email: profile.email, phone: profile.phone, location: profile.location, links: profile.links },
    recipient: { company: job.company, location: job.location ?? "" },
    date: p.date(options.today ?? new Date()),
    subject: FORMAT[language]?.subject(job.title, job.contract) ?? p.subject(job.title),
    salutation: p.salutation(job.company),
    paragraphs: [
      { id: "opening", kind: "opening", text: FORMAT[language]?.opening(job.title, job.company, job.contract, job.programme) ?? p.opening(job.title, job.company), placeholder: false, included: true },
      ...(highlights.length ? [{ id: "highlights", kind: "highlights" as const, text: "", placeholder: false, included: true }] : []),
      // Ready to send without AI: interest in what the posting says the role involves, never invented
      // history. Still flagged as not yet the author's words, so AI drafting and the author can replace it.
      { id: "motivation", kind: "motivation", text: p.interest(job.title, job.company, focusOf(analysis)), placeholder: true, included: true },
      { id: "closing", kind: "closing", text: p.closing, placeholder: false, included: true },
    ],
    highlightsIntro: p.highlightsIntro,
    highlights,
    signoff: p.signoff,
  }
}

/** A paragraph still containing the bracketed instruction is a placeholder. */
export function isPlaceholder(text: string) {
  return /^\s*\[[^\]]{20,}\]\s*$/.test(text) || /\[(?:why|pourquoi|¿por qué|warum)\b/i.test(text)
}

export function letterText(doc: LetterDocument) {
  const parts = [doc.subject, doc.salutation]
  for (const paragraph of doc.paragraphs.filter((p) => p.included)) {
    if (paragraph.kind === "highlights") parts.push(doc.highlightsIntro, ...doc.highlights.filter((h) => h.included).map((h) => h.text))
    else parts.push(paragraph.text)
  }
  parts.push(doc.signoff, doc.header.name)
  return parts.join("\n")
}

export type LetterCheck = { id: string; status: "pass" | "warn" | "fail"; label: string; detail: string }

/** Deterministic quality gate for a cover letter. Ready = no errors and score ≥ 80. */
export function checkLetter(doc: LetterDocument, pages: number | null) {
  const checks: LetterCheck[] = []
  const aiCheck = aiReviewCheck(doc.aiAssistance)
  if (aiCheck) checks.push(aiCheck)
  const add = (id: string, status: LetterCheck["status"], label: string, detail: string) => checks.push({ id, status, label, detail })
  const paragraphs = doc.paragraphs.filter((p) => p.included)
  const pending = paragraphs.filter((p) => p.kind !== "highlights" && (isPlaceholder(p.text) || (p.kind === "motivation" && !p.text.trim())))
  add("placeholders", pending.length ? "fail" : "pass", "Written in your own words", pending.length ? "Replace the bracketed instruction (why this company) with your own sentences." : "No placeholders left.")
  const text = letterText(doc)
  // "Delia" counts for "Delia Technologies": generic endings aren't part of how people name a company.
  const named = (value: string) => {
    if (!value) return true
    const lower = text.toLowerCase()
    const core = value.toLowerCase().replace(/\b(?:technologies|technology|group|groupe|sas|sa|sarl|inc|ltd|llc|gmbh|ag|corp|corporation|company|co|labs?|software|solutions|consulting|france)\.?$/g, "").replace(/[\s,.-]+$/, "").trim()
    return lower.includes(value.toLowerCase()) || (core.length >= 3 && lower.includes(core))
  }
  add("company", named(doc.recipient.company) ? "pass" : "fail", "Names the company", named(doc.recipient.company) ? doc.recipient.company : `“${doc.recipient.company}” is not mentioned.`)
  const highlights = doc.highlights.filter((h) => h.included)
  const showsHighlights = paragraphs.some((p) => p.kind === "highlights") && highlights.length > 0
  const ungrounded = highlights.filter((h) => !h.factIds.length)
  if (showsHighlights) add("evidence", ungrounded.length ? "fail" : "pass", "Backs claims with your evidence", ungrounded.length ? `${ungrounded.length} highlight(s) without a fact.` : `${highlights.length} highlight(s), each backed by a verified fact.`)
  if (highlights.length > 4) add("focus", "warn", "Focused", `${highlights.length} highlights — 2 to 4 read best.`)
  const words = text.split(/\s+/).filter(Boolean).length
  add("length", words > 250 ? "warn" : "pass", "Length", words > 250 ? `${words} words. Consider shortening it to the points that matter most.` : `${words} words.`)
  if (pages === null) add("pages", "warn", "One page", "Not rendered yet.")
  else add("pages", pages <= 1 ? "pass" : "fail", "One page", pages <= 1 ? "Fits on one page." : `${pages} pages — shorten it to one.`)
  add("contact", doc.header.email || doc.header.phone ? "pass" : "fail", "Contact details", doc.header.email || doc.header.phone ? "Present." : "Add an email or phone to your profile.")
  const errors = checks.filter((c) => c.status === "fail").length
  const warnings = checks.filter((c) => c.status === "warn").length
  const score = Math.max(0, 100 - errors * 20 - warnings * 6)
  return { score, errors, warnings, pages: pages ?? 0, ready: errors === 0 && score >= 80, checks }
}
