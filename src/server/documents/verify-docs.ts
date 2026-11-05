/** Second, independent check of AI-rewritten text with the decision model; failing passages are reverted. */
import type { Decide } from "@/server/decisions/jev"
import { SUPPORT_THRESHOLD, verifyClaims } from "@/server/decisions/verify"
import type { ComposeEntry } from "./compose"
import type { CompanySource } from "./ai-compose"
import type { LetterDocument } from "./letter"
import type { CvDocument } from "./model"

const factMap = (entries: ComposeEntry[]) => new Map(entries.flatMap((entry) => entry.facts.map((fact) => [fact.id, fact.statement] as const)))

export async function verifyCvRewrites(doc: CvDocument, entries: ComposeEntry[], decide: Decide): Promise<{ doc: CvDocument; checked: number; reverted: number }> {
  const facts = factMap(entries)
  const next = structuredClone(doc)
  const bullets = next.sections.flatMap((section) => section.items.flatMap((item) => item.bullets)).filter((bullet) => bullet.originalText && bullet.originalText !== bullet.text)
  const scores = await verifyClaims(bullets.map((bullet) => ({ id: bullet.id, text: bullet.text, evidence: [bullet.originalText!, ...bullet.factIds.map((id) => facts.get(id) ?? "").filter(Boolean)] })), decide)
  let reverted = 0
  for (const bullet of bullets) {
    if ((scores.get(bullet.id) ?? 1) >= SUPPORT_THRESHOLD) continue
    bullet.text = bullet.originalText!
    delete bullet.originalText
    delete (bullet as { source?: string }).source
    reverted += 1
  }
  return { doc: next, checked: bullets.length, reverted }
}

export async function verifyLetterRewrites(doc: LetterDocument, entries: ComposeEntry[], sources: CompanySource[], decide: Decide): Promise<{ doc: LetterDocument; checked: number; reverted: number }> {
  const facts = factMap(entries)
  const next = structuredClone(doc)
  const company = sources.map((source) => source.text).slice(0, 8)
  const paragraphs = next.paragraphs.filter((paragraph) => paragraph.originalText !== undefined && paragraph.originalText !== paragraph.text)
  const highlights = next.highlights.filter((highlight) => highlight.originalText && highlight.originalText !== highlight.text)
  const scores = await verifyClaims(
    [
      ...paragraphs.map((paragraph) => ({ id: `p:${paragraph.kind}`, text: paragraph.text, evidence: [...(paragraph.factIds ?? []).map((id) => facts.get(id) ?? "").filter(Boolean), ...(paragraph.kind === "motivation" ? company : [])] })),
      ...highlights.map((highlight) => ({ id: `h:${highlight.id}`, text: highlight.text, evidence: [highlight.originalText!, ...highlight.factIds.map((id) => facts.get(id) ?? "").filter(Boolean)] })),
    ],
    decide,
  )
  let reverted = 0
  for (const paragraph of paragraphs) {
    // Closings make no candidate claims; only opening/motivation are checked strictly.
    if (paragraph.kind === "closing" || (scores.get(`p:${paragraph.kind}`) ?? 1) >= SUPPORT_THRESHOLD) continue
    paragraph.text = paragraph.originalText!
    paragraph.originalText = undefined
    if (paragraph.kind === "motivation") paragraph.placeholder = true
    reverted += 1
  }
  for (const highlight of highlights) {
    if ((scores.get(`h:${highlight.id}`) ?? 1) >= SUPPORT_THRESHOLD) continue
    highlight.text = highlight.originalText!
    highlight.originalText = undefined
    reverted += 1
  }
  return { doc: next, checked: paragraphs.length + highlights.length, reverted }
}
