/**
 * Public job-board APIs a company's careers page runs on. Pure: recognise a
 * board from any of its URLs, and read its postings payload. No API keys needed.
 */
export const BOARD_PROVIDERS = { greenhouse: "Greenhouse", lever: "Lever", ashby: "Ashby", smartrecruiters: "SmartRecruiters", recruitee: "Recruitee", workable: "Workable" } as const
export type BoardProvider = keyof typeof BOARD_PROVIDERS
export type CareersBoard = { provider: BoardProvider; slug: string }
export type BoardPosting = { url: string; title: string; location: string; remote: string; contract: string }

const SLUG = /^[a-z0-9][a-z0-9._-]{0,80}$/i

/** The board behind a careers or posting URL, or null. */
export function boardOf(raw: string): CareersBoard | null {
  let url: URL
  try {
    url = new URL(raw.trim())
  } catch {
    return null
  }
  const host = url.hostname.toLowerCase()
  const first = url.pathname.split("/").filter(Boolean)[0] ?? ""
  const board = (provider: BoardProvider, slug: string): CareersBoard | null => (SLUG.test(slug) ? { provider, slug: slug.toLowerCase() } : null)
  if (/(^|\.)greenhouse\.io$/.test(host)) return board("greenhouse", url.searchParams.get("for") ?? (first === "embed" ? "" : first))
  if (host === "jobs.lever.co" || host === "jobs.eu.lever.co") return board("lever", first)
  if (host === "jobs.ashbyhq.com") return board("ashby", decodeURIComponent(first))
  if (host === "jobs.smartrecruiters.com" || host === "careers.smartrecruiters.com") return board("smartrecruiters", first)
  if (host.endsWith(".recruitee.com")) return board("recruitee", host.split(".")[0])
  if (host === "apply.workable.com") return board("workable", first)
  return null
}

export function boardApi({ provider, slug }: CareersBoard): string {
  return {
    greenhouse: `https://boards-api.greenhouse.io/v1/boards/${slug}/jobs`,
    lever: `https://api.lever.co/v0/postings/${slug}?mode=json`,
    ashby: `https://api.ashbyhq.com/posting-api/job-board/${slug}`,
    smartrecruiters: `https://api.smartrecruiters.com/v1/companies/${slug}/postings?limit=100`,
    recruitee: `https://${slug}.recruitee.com/api/offers/`,
    workable: `https://apply.workable.com/api/v1/widget/accounts/${slug}`,
  }[provider]
}

export function boardPage({ provider, slug }: CareersBoard): string {
  return {
    greenhouse: `https://job-boards.greenhouse.io/${slug}`,
    lever: `https://jobs.lever.co/${slug}`,
    ashby: `https://jobs.ashbyhq.com/${slug}`,
    smartrecruiters: `https://jobs.smartrecruiters.com/${slug}`,
    recruitee: `https://${slug}.recruitee.com`,
    workable: `https://apply.workable.com/${slug}`,
  }[provider]
}

type Row = Record<string, unknown>
const str = (value: unknown) => (typeof value === "string" ? value.trim() : "")
const obj = (value: unknown): Row => (value && typeof value === "object" ? (value as Row) : {})
const rows = (value: unknown): Row[] => (Array.isArray(value) ? value.filter((item) => item && typeof item === "object") as Row[] : [])
const join = (...parts: unknown[]) => parts.map(str).filter(Boolean).join(", ")

/** Postings from a board's API payload; anything malformed is skipped. */
export function postingsFrom(board: CareersBoard, payload: unknown): BoardPosting[] {
  const data = obj(payload)
  const list: BoardPosting[] = {
    greenhouse: () => rows(data.jobs).map((job) => ({ url: str(job.absolute_url), title: str(job.title), location: str(obj(job.location).name), remote: "", contract: "" })),
    lever: () => rows(payload).map((job) => ({ url: str(job.hostedUrl), title: str(job.text), location: str(obj(job.categories).location), remote: str(job.workplaceType), contract: str(obj(job.categories).commitment) })),
    ashby: () => rows(data.jobs).map((job) => ({ url: str(job.jobUrl), title: str(job.title), location: str(job.location), remote: job.isRemote === true ? "remote" : str(job.workplaceType), contract: str(job.employmentType) })),
    smartrecruiters: () => rows(data.content).map((job) => ({ url: str(job.id) ? `https://jobs.smartrecruiters.com/${board.slug}/${str(job.id)}` : "", title: str(job.name), location: join(obj(job.location).city, obj(job.location).country), remote: obj(job.location).remote === true ? "remote" : "", contract: str(obj(job.typeOfEmployment).label) })),
    recruitee: () => rows(data.offers).map((job) => ({ url: str(job.careers_url), title: str(job.title), location: str(job.location), remote: job.remote === true ? "remote" : "", contract: str(job.employment_type_code) })),
    workable: () => rows(data.jobs).map((job) => ({ url: str(job.url) || str(job.shortlink), title: str(job.title), location: join(job.city, job.country), remote: job.telecommuting === true ? "remote" : "", contract: str(job.employment_type) })),
  }[board.provider]()
  return list.filter((posting) => /^https:\/\//.test(posting.url) && posting.title)
}
