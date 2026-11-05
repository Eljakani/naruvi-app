/**
 * Deterministic quality gate for a CV revision. Pure.
 * "Ready" = no errors and score ≥ 80. Every check explains itself and, where
 * possible, says how to fix it.
 */
import type { QualitySummary } from "@/server/db/schema"
import type { CvDocument } from "./model"
import { aiReviewCheck } from "./ai-metadata"

export type Check = { id: string; status: "pass" | "warn" | "fail"; label: string; detail: string }
export type QualityReport = QualitySummary & { ready: boolean; checks: Check[] }

type Req = { kind: string; status: string; text: string; factIds: string[] }

export function checkQuality(doc: CvDocument, pages: number | null, requirements: Req[] = []): QualityReport {
  const checks: Check[] = []
  const aiCheck = aiReviewCheck(doc.aiAssistance)
  if (aiCheck) checks.push(aiCheck)
  const add = (id: string, status: Check["status"], label: string, detail: string) => checks.push({ id, status, label, detail })
  const sections = doc.sections.filter((section) => section.included)
  const items = sections.flatMap((section) => section.items.filter((item) => item.included))
  const bullets = items.flatMap((item) => item.bullets.filter((bullet) => bullet.included))

  const ungrounded = bullets.filter((bullet) => bullet.factIds.length === 0)
  add("grounded", ungrounded.length ? "fail" : "pass", "Every bullet is backed by a verified fact", ungrounded.length ? `${ungrounded.length} bullet(s) have no supporting fact: link them in your profile or remove them.` : `${bullets.length} bullets, all grounded.`)

  const contact = [doc.header.email, doc.header.phone].filter(Boolean).length
  add("contact", contact ? "pass" : "fail", "Contact details", contact ? "Email/phone present." : "Add an email or phone number to your profile.")
  add("headline", doc.header.headline ? "pass" : "warn", "Headline under your name", doc.header.headline ? doc.header.headline : `No headline in this language — add one in Profile → Edit (${doc.language.toUpperCase()}).`)

  if (pages === null) add("pages", "warn", "Page count", "Not rendered yet.")
  else add("pages", pages <= 2 ? "pass" : "fail", "Fits the page budget", pages <= 2 ? `${pages} page${pages === 1 ? "" : "s"}.` : `${pages} pages — exclude older bullets or entries until it fits on 2.`)

  const experience = sections.find((section) => section.kind === "experience")
  const emptyItems = items.filter((item) => experience?.items.includes(item) && item.bullets.filter((b) => b.included).length === 0)
  add("experience", experience?.items.some((item) => item.included) ? (emptyItems.length ? "warn" : "pass") : "fail", "Experience section", !experience ? "No experience with wording in this language. Add bullets to your profile." : emptyItems.length ? `${emptyItems.map((item) => item.title).join(", ")} ha${emptyItems.length === 1 ? "s" : "ve"} no bullets.` : `${experience.items.filter((i) => i.included).length} entries.`)

  const shown = new Set(bullets.flatMap((bullet) => bullet.factIds))
  const provenMust = requirements.filter((r) => r.kind === "must" && (r.status === "met" || r.status === "partial") && r.factIds.length)
  const coveredMust = provenMust.filter((r) => r.factIds.some((id) => shown.has(id)))
  if (provenMust.length) {
    const ratio = coveredMust.length / provenMust.length
    const missing = provenMust.filter((r) => !coveredMust.includes(r)).map((r) => `“${r.text.slice(0, 60)}${r.text.length > 60 ? "…" : ""}”`)
    add("coverage", ratio >= 0.7 ? "pass" : "warn", "Shows your evidence for the must-haves", `${coveredMust.length}/${provenMust.length} proven must-haves appear.${missing.length ? ` Missing: ${missing.slice(0, 3).join("; ")}.` : ""}`)
  }

  add("translations", doc.missingTranslations.length ? "warn" : "pass", "Everything has wording in this language", doc.missingTranslations.length ? `Left out (no ${doc.language.toUpperCase()} bullets yet): ${doc.missingTranslations.map((m) => m.title).join(", ")}.` : "Complete.")

  const long = bullets.filter((bullet) => bullet.text.length > 240)
  add("length", long.length ? "warn" : "pass", "Scannable bullets", long.length ? `${long.length} bullet(s) over 240 characters — shorten them in your profile.` : "All bullets are concise.")
  const crowded = items.filter((item) => item.bullets.filter((b) => b.included).length > 6)
  add("density", crowded.length ? "warn" : "pass", "Not too many bullets per entry", crowded.length ? `${crowded.map((item) => item.title).join(", ")}: more than 6 bullets.` : "Balanced.")

  const errors = checks.filter((check) => check.status === "fail").length
  const warnings = checks.filter((check) => check.status === "warn").length
  const score = Math.max(0, Math.min(100, 100 - errors * 20 - warnings * 6))
  return {
    score,
    errors,
    warnings,
    pages: pages ?? 0,
    ready: errors === 0 && score >= 80,
    checks,
  }
}
