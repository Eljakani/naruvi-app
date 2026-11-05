/** Matches imported CV entries to existing profile entries and finds what is genuinely new. */

export type ExistingEntry = { id: string; kind: string; title: string; status: string; display: Record<string, { role?: string; organization?: string; dates?: string }>; facts: string[]; skills: string[] }
export type ImportCandidate = { kind: string; title: string; display: { role: string; organization: string; dates: string }; facts: string[]; skills: string[] }
export type EntryMatch = { entryId: string; title: string; status: string; newFacts: string[]; newSkills: string[]; knownFacts: number }

const STOP = new Set("the a an and of at in for to de la le les des du et en chez au aux sa sas inc ltd llc gmbh group groupe".split(" "))
const fold = (value: string) => value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
const tokens = (value: string) => new Set(fold(value).split(/[^a-z0-9]+/).filter((token) => token.length > 1 && !STOP.has(token)))
function similarity(a: string, b: string) {
  const x = tokens(a), y = tokens(b)
  if (!x.size || !y.size) return 0
  let shared = 0
  for (const token of x) if (y.has(token)) shared += 1
  return shared / Math.min(x.size, y.size)
}
/** Same claim, possibly reworded slightly. */
export const sameFact = (a: string, b: string) => fold(a).replace(/\W+/g, " ").trim() === fold(b).replace(/\W+/g, " ").trim() || (similarity(a, b) >= 0.85 && Math.abs(tokens(a).size - tokens(b).size) <= 3)

const FAMILY: Record<string, string> = { experience: "work", project: "work", education: "study", certification: "study" }
const family = (kind: string) => FAMILY[kind] ?? kind

export function matchEntry(candidate: ImportCandidate, existing: ExistingEntry[]): EntryMatch | null {
  let best: { entry: ExistingEntry; score: number } | null = null
  for (const entry of existing) {
    if (family(entry.kind) !== family(candidate.kind)) continue
    const shown = Object.values(entry.display ?? {})
    const org = Math.max(0, ...shown.map((value) => similarity(value.organization ?? "", candidate.display.organization)))
    const role = Math.max(0, ...shown.map((value) => similarity(value.role ?? "", candidate.display.role)))
    const title = similarity(entry.title, candidate.title)
    const skills = candidate.kind === "skill" || candidate.kind === "language" ? similarity(entry.skills.join(" "), candidate.skills.join(" ")) : 0
    const score = Math.max(org >= 0.6 ? 0.5 + org * 0.3 + role * 0.2 : 0, title, candidate.display.organization ? 0 : role * 0.9, skills >= 0.5 ? skills : 0)
    if (score >= 0.6 && (!best || score > best.score)) best = { entry, score }
  }
  if (!best) return null
  const newFacts = candidate.facts.filter((fact) => !best!.entry.facts.some((known) => sameFact(known, fact)))
  const known = new Set(best.entry.skills.map((skill) => fold(skill)))
  return {
    entryId: best.entry.id, title: best.entry.title, status: best.entry.status,
    newFacts, newSkills: candidate.skills.filter((skill) => !known.has(fold(skill))),
    knownFacts: candidate.facts.length - newFacts.length,
  }
}
