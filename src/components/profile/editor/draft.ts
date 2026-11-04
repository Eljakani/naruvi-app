import type { ProfileEntry } from "@/server/profile/repository"
import type { EntryInput } from "@/server/profile/schemas"
import { entryKinds, entryStatuses } from "@/server/profile/schemas"

export type Lang = "en" | "fr"
export const LANGS: Lang[] = ["en", "fr"]
export type DisplayFields = { role: string; organization: string; dates: string; location: string }
export type DraftFact = { key: string; statement: string }
export type DraftBullet = { key: string; group: string; role: "bullet" | "label"; language: string; text: string; factKeys: string[] }
export type Draft = {
  title: string
  kind: (typeof entryKinds)[number]
  status: (typeof entryStatuses)[number]
  display: Record<Lang, DisplayFields>
  tags: string[]
  skills: string[]
  evidence: string[]
  doNotClaim: string[]
  confidential: boolean
  logoPath: string | null
  facts: DraftFact[]
  bullets: DraftBullet[]
}

export const newKey = () => crypto.randomUUID()
const emptyDisplay = (): DisplayFields => ({ role: "", organization: "", dates: "", location: "" })

export function toDraft(entry: ProfileEntry | null): Draft {
  if (!entry) {
    return {
      title: "",
      kind: "experience",
      status: "needs_review",
      display: { en: emptyDisplay(), fr: emptyDisplay() },
      tags: [],
      skills: [],
      evidence: [],
      doNotClaim: [],
      confidential: false,
      logoPath: null,
      facts: [],
      bullets: [],
    }
  }
  return {
    title: entry.title,
    kind: entry.kind,
    status: entry.status,
    display: { en: { ...emptyDisplay(), ...entry.display.en }, fr: { ...emptyDisplay(), ...entry.display.fr } },
    tags: entry.tags,
    skills: entry.skills,
    evidence: entry.evidence,
    doNotClaim: entry.doNotClaim,
    confidential: entry.confidential,
    logoPath: entry.logoPath,
    facts: entry.facts.map((fact) => ({ key: fact.id, statement: fact.statement })),
    bullets: entry.phrasings.map((phrasing) => ({
      key: phrasing.id,
      group: phrasing.group,
      role: phrasing.role,
      language: phrasing.language,
      text: phrasing.text,
      factKeys: phrasing.factIds,
    })),
  }
}

/** Serialize the draft into the server's validated input shape. */
export function toInput(draft: Draft): EntryInput {
  const facts = draft.facts.filter((fact) => fact.statement.trim())
  const index = new Map(facts.map((fact, i) => [fact.key, i]))
  return {
    title: draft.title.trim() || draft.display.en.role || draft.display.fr.role || "Untitled entry",
    kind: draft.kind,
    status: draft.status,
    display: Object.fromEntries(
      LANGS.map((lang) => [lang, Object.fromEntries(Object.entries(draft.display[lang]).filter(([, value]) => value.trim()))] as const).filter(
        ([, fields]) => Object.keys(fields).length,
      ),
    ),
    tags: draft.tags,
    skills: draft.skills,
    evidence: draft.evidence,
    doNotClaim: draft.doNotClaim,
    confidential: draft.confidential,
    logoPath: draft.logoPath,
    facts: facts.map((fact) => ({ statement: fact.statement.trim() })),
    phrasings: draft.bullets
      .filter((bullet) => bullet.text.trim())
      .map((bullet) => ({
        group: bullet.group.trim() || "General",
        role: bullet.role,
        language: bullet.language,
        text: bullet.text.trim(),
        factRefs: bullet.factKeys.map((key) => index.get(key)).filter((value): value is number => value !== undefined),
      })),
  }
}

/** Bullets of one group arranged as EN/FR rows by position. */
export function pairRows(bullets: DraftBullet[]) {
  const rows: Partial<Record<Lang, DraftBullet>>[] = []
  const seen: Record<string, number> = {}
  for (const bullet of bullets) {
    const lang = (bullet.language === "fr" ? "fr" : "en") as Lang
    const index = seen[lang] ?? 0
    seen[lang] = index + 1
    rows[index] ??= {}
    rows[index][lang] = bullet
  }
  return rows
}
