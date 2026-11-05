/**
 * CV content agent: revise → render & score with the real quality checks →
 * feed the fixable problems back → revise again, keeping the best version.
 * Used for the first generation (after tailoring) and for every "Ask AI".
 */
import type { CvDocument } from "./model"
import type { QualityReport } from "./quality"

/** Quality checks the content agent can fix by itself (others need the profile). */
const FIXABLE = new Set(["pages", "coverage", "length", "density", "headline"])

export type Evaluation = { pages: number; quality: QualityReport }
export type Revise = (doc: CvDocument, instruction: string) => Promise<{ doc: CvDocument; changed: number; rejected: number; note: string }>
export type Evaluate = (doc: CvDocument) => Promise<Evaluation>

export type CvRound = { round: number; note: string; changed: number; rejected: number; score: number; pages: number; problems: string[] }
export type CvAgentResult = { doc: CvDocument; rounds: CvRound[]; scoreBefore: number; scoreAfter: number; pages: number; changed: number; note: string; improved: boolean }

/** The problems worth another round, as short instructions. */
export function fixableProblems(evaluation: Evaluation) {
  return evaluation.quality.checks
    .filter((check) => FIXABLE.has(check.id) && check.status !== "pass" && !(check.id === "pages" && check.status === "warn"))
    .map((check) => `${check.label}: ${check.detail}`)
}

/** "fit on one page", "2 pages max", "une seule page"… → the page target, if the request has one. */
export function pageTarget(request = ""): number | null {
  const text = request.toLowerCase()
  if (/\b(one|1|single|une|un seul|une seule|una|eine)\s*(-\s*)?(page|pager|página|seite)/.test(text)) return 1
  if (/\b(two|2|deux|dos|zwei)\s*(page|pages|páginas|seiten)/.test(text)) return 2
  return null
}

const rank = (evaluation: Evaluation) => evaluation.quality.score - evaluation.quality.errors * 15 - fixableProblems(evaluation).length * 3

/**
 * Lines to drop first when a page target is missed: later bullets of later
 * (older) entries, never must-have evidence, never an entry's only line.
 */
export function trimCandidates(doc: CvDocument, protect: Set<string>) {
  // bullet = -1 means "drop the whole entry".
  const out: { section: number; item: number; bullet: number; weight: number }[] = []
  doc.sections.forEach((section, s) => {
    if (!section.included || !["project", "achievement", "certification"].includes(section.kind)) return
    const shown = section.items.filter((item) => item.included)
    if (shown.length <= 1) return
    section.items.forEach((item, i) => {
      const position = shown.indexOf(item)
      if (!item.included || position === 0 || item.bullets.some((bullet) => bullet.included && bullet.factIds.some((id) => protect.has(id)))) return
      out.push({ section: s, item: i, bullet: -1, weight: 20 + position * 3 + item.bullets.filter((bullet) => bullet.included).length })
    })
  })
  doc.sections.forEach((section, s) => {
    if (!section.included) return
    section.items.forEach((item, i) => {
      if (!item.included) return
      const shown = item.bullets.filter((bullet) => bullet.included)
      if (shown.length <= 1) return
      item.bullets.forEach((bullet, b) => {
        if (!bullet.included || bullet.factIds.some((id) => protect.has(id))) return
        const position = shown.indexOf(bullet)
        if (position === 0) return
        out.push({ section: s, item: i, bullet: b, weight: i * 3 + position * 2 + bullet.text.length / 120 + (section.kind === "experience" ? 0 : 4) })
      })
    })
  })
  return out.sort((a, b) => b.weight - a.weight)
}

export async function runCvAgent(start: CvDocument, input: { request?: string; maxRounds?: number; protectFacts?: Set<string> }, deps: { revise: Revise; evaluate: Evaluate }): Promise<CvAgentResult> {
  const maxRounds = input.maxRounds ?? 3
  const target = pageTarget(input.request)
  const requestProblems = (evaluation: Evaluation) =>
    target && evaluation.pages > target ? [`The person asked for ${target} page${target === 1 ? "" : "s"}; it is ${evaluation.pages}. Set included=false on the least relevant lines that are currently included (older or generic ones) and shorten long ones, keeping must-have evidence, until it fits. Only return lines you change.`] : []
  const first = await deps.evaluate(start)
  let best = { doc: start, evaluation: first }
  let current = best
  const rounds: CvRound[] = []
  let total = 0
  for (let round = 1; round <= maxRounds; round += 1) {
    const problems = [...requestProblems(current.evaluation), ...fixableProblems(current.evaluation)]
    const userTurn = round === 1 && input.request
    if (!userTurn && !problems.length) break
    const instruction = [
      userTurn ? input.request : "Improve the CV so it passes the quality checks below.",
      problems.length ? `The rendered CV currently has these problems (${current.evaluation.pages} page${current.evaluation.pages === 1 ? "" : "s"}, score ${current.evaluation.quality.score}/100); fix them while honouring the request:\n- ${problems.join("\n- ")}` : "",
    ].filter(Boolean).join("\n\n")
    const revised = await deps.revise(current.doc, instruction)
    if (!revised.changed) {
      rounds.push({ round, note: revised.note, changed: 0, rejected: revised.rejected, score: current.evaluation.quality.score, pages: current.evaluation.pages, problems })
      break
    }
    const evaluation = await deps.evaluate(revised.doc)
    total += revised.changed
    rounds.push({ round, note: revised.note, changed: revised.changed, rejected: revised.rejected, score: evaluation.quality.score, pages: evaluation.pages, problems: [...requestProblems(evaluation), ...fixableProblems(evaluation)] })
    current = { doc: revised.doc, evaluation }
    // Meeting the page target beats a small score difference.
    if (target && evaluation.pages <= target && best.evaluation.pages > target) { best = current; continue }
    // A request round is kept unless it made the CV clearly worse; fix-up rounds must improve.
    if (rank(evaluation) > rank(best.evaluation) || (userTurn && rank(evaluation) >= rank(best.evaluation) - 5)) best = current
  }
  // Page target still missed: drop the least important lines one by one, measuring each time.
  if (target && best.evaluation.pages > target) {
    let doc = structuredClone(best.doc)
    let dropped = 0
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const [next] = trimCandidates(doc, input.protectFacts ?? new Set())
      if (!next) break
      if (next.bullet < 0) doc.sections[next.section].items[next.item].included = false
      else doc.sections[next.section].items[next.item].bullets[next.bullet].included = false
      dropped += 1
      const evaluation = await deps.evaluate(doc)
      if (evaluation.pages <= target) {
        best = { doc, evaluation }
        rounds.push({ round: rounds.length + 1, note: `Hid ${dropped} lower-priority line${dropped === 1 ? "" : "s"} or entr${dropped === 1 ? "y" : "ies"} to fit ${target} page${target === 1 ? "" : "s"}`, changed: dropped, rejected: 0, score: evaluation.quality.score, pages: evaluation.pages, problems: [] })
        total += dropped
        break
      }
      doc = structuredClone(doc)
    }
  }
  const met = !target || best.evaluation.pages <= target
  const lastNote = [...rounds].reverse().find((round) => round.changed)?.note
  const note = !met ? `Couldn’t get it to ${target} page${target === 1 ? "" : "s"} without dropping must-have evidence` : target && best !== undefined && rounds.at(-1)?.note.startsWith("Hid ") ? rounds.at(-1)!.note : lastNote || rounds[0]?.note || ""
  return {
    doc: best.doc,
    rounds,
    scoreBefore: first.quality.score,
    scoreAfter: best.evaluation.quality.score,
    pages: best.evaluation.pages,
    changed: best.doc === start ? 0 : total,
    note,
    improved: best.doc !== start,
  }
}
