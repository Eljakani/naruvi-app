import type { ParsedJob } from "./schema"
import { pickBest, parseSource } from "./select"
import { apiCandidates, parseJobUrl } from "./vendor/job-parser"

export type JobPage = { html: string; finalUrl: string }
export type TextResponse = { text: string; finalUrl: string; contentType: string; status: number }
export type UrlSourceDependencies = {
  fetchText: (url: string) => Promise<TextResponse>
  renderPage: (url: string) => Promise<JobPage>
}

const wall = /^(?:just a moment|access denied|attention required|please (?:enable|turn on) javascript|enable javascript|verify (?:that )?you are human|checking your browser|sign in to (?:view|continue)|log in to (?:view|continue)|cookie (?:policy|consent)|privacy preference)/i

function blocked(job: ParsedJob) {
  return wall.test(job.role.trim()) || wall.test(job.description.trim()) || /captcha|authwall/i.test(job.role)
}

/** Evaluate extracted content, not raw HTML: many complete postings contain a noscript notice. */
export function needsBrowser(job: ParsedJob | null): boolean {
  return !job || !job.role || !job.company || job.description.trim().length < 500 ||
    blocked(job)
}

function choose(a: ParsedJob | null, b: ParsedJob): ParsedJob {
  if (!a) return b
  if (blocked(a) !== blocked(b)) return blocked(a) ? b : a
  if (needsBrowser(a) !== needsBrowser(b)) return needsBrowser(a) ? b : a
  return pickBest([a, b])!
}

/** HTTP/ATS first; one bounded browser attempt only when extraction needs help. */
export async function parseFromUrl(input: string, dependencies: UrlSourceDependencies) {
  const info = parseJobUrl(input)
  const pageUrl = info.canonical || input
  const candidates = [...apiCandidates(input), { url: pageUrl, kind: "page" }].filter(
    (candidate, index, all) => candidate.url && all.findIndex((item) => item.url === candidate.url) === index,
  )
  let best: ParsedJob | null = null
  let page: JobPage | null = null
  const errors: string[] = []
  for (const candidate of candidates) {
    try {
      const fetched = await dependencies.fetchText(candidate.url)
      if (fetched.status >= 400) throw new Error(`${new URL(candidate.url).host} answered ${fetched.status}`)
      const job = parseSource(candidate.kind, fetched.text, fetched.contentType, input, fetched.finalUrl)
      if (candidate.kind === "page") page = { html: fetched.text, finalUrl: fetched.finalUrl }
      best = choose(best, job)
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error))
    }
  }
  if (needsBrowser(best)) {
    try {
      const rendered = await dependencies.renderPage(pageUrl)
      const job = parseSource("page", rendered.html, "text/html", input, rendered.finalUrl)
      const selected = choose(best, job)
      if (selected === job) {
        best = { ...job, source: `browser:${job.source}` }
        page = rendered
      }
      if (needsBrowser(best)) errors.push("The browser could not extract a complete posting. Check the text or paste the full description.")
    } catch (error) {
      errors.push(`Browser fallback: ${error instanceof Error ? error.message : String(error)}`)
    }
    if (best && needsBrowser(best)) best.warnings.push(errors.at(-1)!)
  }
  if (!best || best.description.trim().length < 80 || blocked(best)) {
    throw new Error(`Could not read this posting (${errors.at(-1) ?? "no useful job content"}). Paste the job text instead.`)
  }
  return { job: best, page, errors }
}
