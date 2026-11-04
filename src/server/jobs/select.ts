/** Pure: score parses of the same posting from different sources and pick one. */
import { parsedJob, type ParsedJob } from "./schema"
import { parseJobApi, parseJobDocument } from "./vendor/job-parser"

export function scoreParse(job: ParsedJob) {
  return (job.role ? 2 : 0) + (job.company ? 2 : 0) + (job.description.length > 500 ? 3 : job.description.length > 200 ? 1 : 0) + (job.location ? 1 : 0) + job.confidence
}

/** Parse one raw response for a source kind ("page", "linkedin", or an ATS API). */
export function parseSource(kind: string, body: string, contentType: string, inputUrl: string, finalUrl = inputUrl): ParsedJob {
  const looksJson = /json/i.test(contentType) || /^\s*[[{]/.test(body.slice(0, 200))
  if (kind === "linkedin") return parsedJob.parse({ ...parseJobDocument({ html: body, url: inputUrl }), source: "linkedin" })
  if (kind !== "page" && looksJson) return parsedJob.parse(parseJobApi(kind, JSON.parse(body), inputUrl))
  return parsedJob.parse(parseJobDocument({ html: body, url: kind === "page" ? finalUrl : inputUrl }))
}

export function pickBest(parses: ParsedJob[]): ParsedJob | null {
  return parses.reduce<ParsedJob | null>((best, job) => (!best || scoreParse(job) > scoreParse(best) ? job : best), null)
}
