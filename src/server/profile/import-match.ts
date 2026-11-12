/** Matches imported CV entries to existing profile entries and finds what is genuinely new. */
import { entryName, entryView, type EntryFields, type EntryText } from "@/lib/entry-fields"

export type ExistingEntry = { id: string; kind: string; status: string; display: EntryText; fields: EntryFields; facts: string[]; skills: string[] }
export type ImportCandidate = { kind: string; text: Record<string, string>; fields: EntryFields; facts: string[]; skills: string[] }
/** `name` is the matched entry's own heading, for the review screen. */
export type EntryMatch = { entryId: string; name: string; status: string; newFacts: string[]; newSkills: string[]; knownFacts: number }

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
  const wanted = entryView({ kind: candidate.kind, display: { x: candidate.text }, fields: candidate.fields }, "x")
  for (const entry of existing) {
    if (family(entry.kind) !== family(candidate.kind)) continue
    const views = [...new Set(["en", ...Object.keys(entry.display)])].map((lang) => entryView(entry, lang))
    const org = Math.max(0, ...views.map((view) => similarity(view.subheading, wanted.subheading)))
    const role = Math.max(0, ...views.map((view) => similarity(view.heading, wanted.heading)))
    const skills = candidate.kind === "skill" ? similarity(entry.skills.join(" "), candidate.skills.join(" ")) : 0
    const score = Math.max(org >= 0.6 ? 0.5 + org * 0.3 + role * 0.2 : 0, wanted.subheading ? 0 : role * 0.9, wanted.subheading && role >= 0.9 && org >= 0.4 ? role : 0, skills >= 0.5 ? skills : 0)
    if (score >= 0.6 && (!best || score > best.score)) best = { entry, score }
  }
  if (!best) return null
  const newFacts = candidate.facts.filter((fact) => !best!.entry.facts.some((known) => sameFact(known, fact)))
  const known = new Set(best.entry.skills.map((skill) => fold(skill)))
  return {
    entryId: best.entry.id, name: entryName(best.entry, Object.keys(best.entry.display)[0] ?? "en"), status: best.entry.status,
    newFacts, newSkills: candidate.skills.filter((skill) => !known.has(fold(skill))),
    knownFacts: candidate.facts.length - newFacts.length,
  }
}
