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
import { templateIds } from "./model"
import type { ComposeAnalysis, ComposeEntry, ComposeProfile } from "./compose"

export const letterParagraph = z.object({
  id: z.string(),
  kind: z.enum(["opening", "highlights", "motivation", "closing", "custom"]),
  text: z.string().max(3000).default(""),
  /** True while the text still asks the user to write something. */
  placeholder: z.boolean().default(false),
  included: z.boolean().default(true),
})

export const letterHighlight = z.object({
  id: z.string(),
  text: z.string().max(600),
  organization: z.string().default(""),
  factIds: z.array(z.string()).default([]),
  included: z.boolean().default(true),
})

export const letterDocument = z.object({
  version: z.literal(1),
  kind: z.literal("cover_letter"),
  language: z.string().regex(/^[a-z]{2}$/),
  template: z.enum(templateIds).default("classic"),
  accent: z.string().regex(/^#[0-9a-f]{6}$/i).default("#2563eb"),
  header: z.object({
    name: z.string(),
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
  closing: string
  signoff: string
  date: (d: Date) => string
}

const fmt = (locale: string) => (d: Date) => d.toLocaleDateString(locale, { day: "numeric", month: "long", year: "numeric" })

export const LETTER_PHRASES: Record<string, Phrases> = {
  en: {
    subject: (role) => `Application for the ${role} position`,
    salutation: (company) => `Dear ${company} hiring team,`,
    opening: (role, company) => `I am writing to apply for the ${role} position at ${company}. My experience matches several of the requirements in your posting, as outlined below.`,
    highlightsIntro: "Relevant highlights from my experience:",
    motivation: (company) => `[Why ${company}? In 2–3 sentences of your own, say what draws you to this team, product or mission. Only you can write this part.]`,
    closing: "I would welcome the opportunity to discuss how I can contribute to your team. Thank you for your time and consideration.",
    signoff: "Kind regards,",
    date: fmt("en-GB"),
  },
  fr: {
    subject: (role) => `Candidature au poste de ${role}`,
    salutation: () => "Madame, Monsieur,",
    opening: (role, company) => `Je vous adresse ma candidature au poste de ${role} au sein de ${company}. Mon parcours répond à plusieurs des exigences de votre annonce, comme détaillé ci-dessous.`,
    highlightsIntro: "Quelques réalisations en lien avec le poste :",
    motivation: (company) => `[Pourquoi ${company} ? En 2 à 3 phrases, avec vos propres mots, expliquez ce qui vous attire dans cette équipe, ce produit ou cette mission. Vous seul pouvez écrire cette partie.]`,
    closing: "Je me tiens à votre disposition pour un entretien afin d’échanger sur ma contribution possible à votre équipe. Je vous remercie pour votre attention.",
    signoff: "Je vous prie d’agréer, Madame, Monsieur, l’expression de mes salutations distinguées.",
    date: fmt("fr-FR"),
  },
  es: {
    subject: (role) => `Candidatura al puesto de ${role}`,
    salutation: (company) => `Estimado equipo de selección de ${company}:`,
    opening: (role, company) => `Les escribo para presentar mi candidatura al puesto de ${role} en ${company}. Mi experiencia responde a varios de los requisitos de su oferta, como detallo a continuación.`,
    highlightsIntro: "Logros relevantes de mi experiencia:",
    motivation: (company) => `[¿Por qué ${company}? En 2–3 frases propias, explique qué le atrae de este equipo, producto o misión. Solo usted puede escribir esta parte.]`,
    closing: "Me encantaría tener la oportunidad de conversar sobre cómo puedo contribuir a su equipo. Gracias por su tiempo y consideración.",
    signoff: "Atentamente,",
    date: fmt("es-ES"),
  },
  de: {
    subject: (role) => `Bewerbung als ${role}`,
    salutation: () => "Sehr geehrte Damen und Herren,",
    opening: (role, company) => `hiermit bewerbe ich mich um die Position als ${role} bei ${company}. Meine Erfahrung entspricht mehreren Anforderungen Ihrer Ausschreibung, wie unten beschrieben.`,
    highlightsIntro: "Relevante Ergebnisse aus meiner Erfahrung:",
    motivation: (company) => `[Warum ${company}? Beschreiben Sie in 2–3 eigenen Sätzen, was Sie an diesem Team, Produkt oder dieser Mission reizt. Nur Sie können diesen Teil schreiben.]`,
    closing: "Über die Gelegenheit zu einem persönlichen Gespräch freue ich mich sehr. Vielen Dank für Ihre Zeit.",
    signoff: "Mit freundlichen Grüßen",
    date: fmt("de-DE"),
  },
}

export function phrasesFor(language: string): Phrases {
  return LETTER_PHRASES[language] ?? LETTER_PHRASES.en
}

const clean = (text: string) => text.replace(/\*\*(.+?)\*\*/g, "$1").trim()

export function composeLetter(
  profile: ComposeProfile,
  entries: ComposeEntry[],
  analysis: (ComposeAnalysis & { requirements: { kind: string; status: string; factIds: string[]; text?: string }[] }) | null,
  job: { title: string; company: string; location?: string },
  options: { language: string; today?: Date; maxHighlights?: number },
): LetterDocument {
  const { language } = options
  const p = phrasesFor(language)
  const verified = entries.filter((entry) => entry.status === "verified")

  // Highlights: for each proven must-have (then responsibilities), the user's
  // best approved bullet in this language that cites the evidence.
  const highlights: LetterDocument["highlights"] = []
  const used = new Set<string>()
  const ranked = [...(analysis?.requirements ?? [])]
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
    version: 1,
    kind: "cover_letter",
    language,
    template: "classic",
    accent: "#2563eb",
    header: { name: profile.fullName, email: profile.email, phone: profile.phone, location: profile.location, links: profile.links },
    recipient: { company: job.company, location: job.location ?? "" },
    date: p.date(options.today ?? new Date()),
    subject: p.subject(job.title),
    salutation: p.salutation(job.company),
    paragraphs: [
      { id: "opening", kind: "opening", text: p.opening(job.title, job.company), placeholder: false, included: true },
      { id: "highlights", kind: "highlights", text: "", placeholder: false, included: highlights.length > 0 },
      { id: "motivation", kind: "motivation", text: p.motivation(job.company), placeholder: true, included: true },
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
  const add = (id: string, status: LetterCheck["status"], label: string, detail: string) => checks.push({ id, status, label, detail })
  const paragraphs = doc.paragraphs.filter((p) => p.included)
  const pending = paragraphs.filter((p) => p.kind !== "highlights" && isPlaceholder(p.text))
  add("placeholders", pending.length ? "fail" : "pass", "Written in your own words", pending.length ? "Replace the bracketed instruction (why this company) with your own sentences." : "No placeholders left.")
  const text = letterText(doc)
  const named = (value: string) => !value || text.toLowerCase().includes(value.toLowerCase())
  add("company", named(doc.recipient.company) ? "pass" : "fail", "Names the company", named(doc.recipient.company) ? doc.recipient.company : `“${doc.recipient.company}” is not mentioned.`)
  const highlights = doc.highlights.filter((h) => h.included)
  const showsHighlights = paragraphs.some((p) => p.kind === "highlights") && highlights.length > 0
  const ungrounded = highlights.filter((h) => !h.factIds.length)
  add("evidence", !showsHighlights ? "warn" : ungrounded.length ? "fail" : "pass", "Backs claims with your evidence", !showsHighlights ? "No highlights included: add 2–3 so the letter shows proof, not just intent." : ungrounded.length ? `${ungrounded.length} highlight(s) without a fact.` : `${highlights.length} highlight(s), each backed by a verified fact.`)
  if (highlights.length > 4) add("focus", "warn", "Focused", `${highlights.length} highlights — 2 to 4 read best.`)
  const words = text.split(/\s+/).filter(Boolean).length
  add("length", words < 120 ? "warn" : words > 480 ? "warn" : "pass", "Length", words < 120 ? `${words} words — a little short; expand your motivation.` : words > 480 ? `${words} words — aim for under 450.` : `${words} words.`)
  if (pages === null) add("pages", "warn", "One page", "Not rendered yet.")
  else add("pages", pages <= 1 ? "pass" : "fail", "One page", pages <= 1 ? "Fits on one page." : `${pages} pages — shorten it to one.`)
  add("contact", doc.header.email || doc.header.phone ? "pass" : "fail", "Contact details", doc.header.email || doc.header.phone ? "Present." : "Add an email or phone to your profile.")
  const errors = checks.filter((c) => c.status === "fail").length
  const warnings = checks.filter((c) => c.status === "warn").length
  const score = Math.max(0, 100 - errors * 20 - warnings * 6)
  return { score, errors, warnings, pages: pages ?? 0, ready: errors === 0 && score >= 80, checks }
}
