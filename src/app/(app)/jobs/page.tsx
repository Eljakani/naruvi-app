import Link from "next/link"
import { Suspense } from "react"
import { connection } from "next/server"
import { BriefcaseBusinessIcon, ChevronLeftIcon, ChevronRightIcon, MapPinIcon, PlusIcon, SearchIcon } from "lucide-react"
import { PageHeader } from "@/components/page-header"
import { EntryLogo } from "@/components/profile/entry-logo"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Skeleton } from "@/components/ui/skeleton"
import { FitRing } from "@/components/applications/fit-ring"
import { ClearFilters, SearchBox, UrlSelect } from "@/components/list-toolbar"
import { CONTRACT_LABEL, SENIORITY_LABEL, WORK_MODE_LABEL } from "@/lib/job-labels"
import { STATUS_LABEL } from "@/lib/stages"
import { cn } from "@/lib/utils"
import { AddJobDialog } from "@/components/jobs/job-reader"
import { JobLeads } from "@/components/jobs/job-leads"
import { allTags } from "@/server/companies/repository"
import { newLeads } from "@/server/jobs/leads"
import { JOB_SORTS, JOB_STAGES, jobFacets, searchJobs } from "@/server/jobs/search"

export const metadata = { title: "Discover" }

type Search = Promise<Record<string, string | string[] | undefined>>
const one = (value: string | string[] | undefined) => (typeof value === "string" ? value : undefined)
const FILTERS = ["q", "tag", "workMode", "contract", "seniority", "stage", "sort"]

export default function JobsPage({ searchParams }: PageProps<"/jobs">) {
  return (
    <>
      <PageHeader
        title="Discover"
        description="Postings to look at before you commit: from job-alert emails, your browser and links you paste. Track one to start its application."
        actions={
          <AddJobDialog trigger={<Button><PlusIcon /> Add a job</Button>} />
        }
      />
      <Suspense fallback={<div className="grid gap-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-20 rounded-xl" />)}</div>}>
        <JobList searchParams={searchParams} />
      </Suspense>
    </>
  )
}

const BOARD_LABEL: Record<string, string> = { linkedin: "LinkedIn", greenhouse: "Greenhouse", lever: "Lever", ashby: "Ashby", smartrecruiters: "SmartRecruiters", workday: "Workday", manual: "Pasted", generic: "Careers page", "job-board": "Job board" }

const options = (all: string, counts: Map<string, number>, labels: Record<string, string>) => [
  { value: "all", label: all },
  ...Object.keys(labels).filter((key) => counts.has(key)).map((key) => ({ value: key, label: `${labels[key]} (${counts.get(key)})` })),
]

async function JobList({ searchParams }: { searchParams: Search }) {
  await connection()
  const params = await searchParams
  const pick = <T extends string>(value: string | undefined, allowed: Record<T, string>) => (value && Object.hasOwn(allowed, value) ? (value as T) : undefined)
  const filter = {
    q: one(params.q)?.slice(0, 200),
    workMode: pick(one(params.workMode), WORK_MODE_LABEL),
    contract: pick(one(params.contract), CONTRACT_LABEL),
    seniority: pick(one(params.seniority), SENIORITY_LABEL),
    stage: pick(one(params.stage), JOB_STAGES) ?? "new",
    sort: pick(one(params.sort), JOB_SORTS),
    page: Number(one(params.page)) || 1,
  }
  const [tags, leads] = await Promise.all([allTags(), newLeads()])
  const tag = one(params.tag)
  const [result, facets] = await Promise.all([searchJobs({ ...filter, tag: tag && tags.some((item) => item.tag === tag) ? tag : undefined }), jobFacets()])
  if (!facets.total && !leads.length) {
    return (
      <Empty className="border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <BriefcaseBusinessIcon />
          </EmptyMedia>
          <EmptyTitle>Nothing to discover yet</EmptyTitle>
          <EmptyDescription>Paste a link from LinkedIn, Greenhouse, Lever, Ashby, Workday or any careers page.</EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <AddJobDialog trigger={<Button><PlusIcon /> Add your first job</Button>} />
        </EmptyContent>
      </Empty>
    )
  }
  const filtered = Boolean(filter.q || tag || filter.workMode || filter.contract || filter.seniority || filter.stage !== "all")
  const pageHref = (page: number) => {
    const query = new URLSearchParams(Object.entries(params).filter(([key, value]) => key !== "page" && typeof value === "string") as [string, string][])
    if (page > 1) query.set("page", String(page))
    const text = query.toString()
    return text ? `/jobs?${text}` : "/jobs"
  }
  return (
    <div className="grid gap-3">
      <JobLeads leads={leads} />
      <div className="flex flex-wrap items-center gap-2">
        <SearchBox placeholder="Search title, company, location, text…" />
        {tags.length ? <UrlSelect name="tag" label="Tag" options={[{ value: "all", label: "Any tag" }, ...tags.map((item) => ({ value: item.tag, label: `${item.tag} (${item.count})` }))]} /> : null}
        <UrlSelect name="stage" label="Stage" options={Object.entries(JOB_STAGES).map(([value, label]) => ({ value, label }))} className="w-44" />
        {facets.workMode.size ? <UrlSelect name="workMode" label="Work mode" options={options("Any work mode", facets.workMode, WORK_MODE_LABEL)} /> : null}
        {facets.contract.size ? <UrlSelect name="contract" label="Contract" options={options("Any contract", facets.contract, CONTRACT_LABEL)} /> : null}
        {facets.seniority.size ? <UrlSelect name="seniority" label="Seniority" options={options("Any seniority", facets.seniority, SENIORITY_LABEL)} /> : null}
        <ClearFilters names={FILTERS.filter((name) => name !== "sort")} />
        <div className="ml-auto flex items-center gap-2">
          <span className="text-sm text-muted-foreground tabular-nums">{filtered ? `${result.total} of ${facets.total}` : `${facets.total} job${facets.total === 1 ? "" : "s"}`}</span>
          <UrlSelect name="sort" label="Sort" options={Object.entries(JOB_SORTS).map(([value, label]) => ({ value, label }))} className="w-36" />
        </div>
      </div>
      {result.jobs.length ? (
        <div className="grid gap-2">
          {result.jobs.map((job) => {
            const closed = Boolean(job.archivedAt) || job.status === "rejected" || job.status === "withdrawn"
            const details = [job.insights?.workMode && WORK_MODE_LABEL[job.insights.workMode], job.insights?.contract && CONTRACT_LABEL[job.insights.contract], job.insights?.seniority && SENIORITY_LABEL[job.insights.seniority]].filter(Boolean)
            return (
              <Link key={job.id} href={`/jobs/${job.id}`} className="group block rounded-xl focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
                <Card className={cn("flex flex-row items-center gap-4 px-5 py-3.5 transition-colors group-hover:bg-muted/40", closed && "opacity-70")}>
                  <EntryLogo path={job.logoPath} name={job.company ?? "?"} size={40} morph={`job-${job.id}`} />
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="truncate font-medium">{job.title}</span>
                      {job.tags.length ? (
                        <span className="hidden shrink-0 gap-1 md:flex">
                          {job.tags.slice(0, 3).map((item) => (
                            <Badge key={item} variant="outline" className="h-5 font-normal">
                              {item}
                            </Badge>
                          ))}
                        </span>
                      ) : null}
                    </div>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
                      <span>{job.company}</span>
                      {job.location ? (
                        <span className="inline-flex items-center gap-1">
                          <MapPinIcon className="size-3" /> {job.location}
                        </span>
                      ) : null}
                      {details.length ? <span>{details.join(" · ")}</span> : job.remote ? <span>{job.remote}</span> : null}
                    </div>
                  </div>
                  <div className="hidden items-center gap-2 sm:flex">
                    {job.applicationId ? <Badge variant={closed ? "outline" : job.status === "ready" ? "default" : "secondary"}>{job.archivedAt ? "Archived" : STATUS_LABEL[job.status!]}</Badge> : <Badge variant="outline" className="font-normal text-muted-foreground">Not analyzed</Badge>}
                    {job.fit !== null ? <FitRing score={job.fit} size={32} /> : null}
                    <Badge variant="outline" className="font-mono text-[11px] uppercase">
                      {job.language}
                    </Badge>
                    <span className="hidden w-36 truncate text-right text-xs whitespace-nowrap text-muted-foreground lg:inline">{BOARD_LABEL[job.board] ?? job.board} · {job.createdAt.toLocaleDateString(undefined, { day: "numeric", month: "short" })}</span>
                  </div>
                  <ChevronRightIcon className="size-4 text-muted-foreground" />
                </Card>
              </Link>
            )
          })}
        </div>
      ) : (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <SearchIcon />
            </EmptyMedia>
            <EmptyTitle>{filter.stage === "new" && !filter.q ? "You’re tracking every posting" : "No matching postings"}</EmptyTitle>
            <EmptyDescription>{filter.stage === "new" && !filter.q ? <>Everything you saved is in <Link href="/applications" className="underline underline-offset-2">Applications</Link>. New links from job-alert emails and your browser show up above.</> : <>{filter.q ? `Nothing matches “${filter.q}” with these filters.` : "No posting matches these filters."} Try fewer words or clear a filter.</>}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}
      {result.pages > 1 ? (
        <nav className="flex items-center justify-between gap-2" aria-label="Pages">
          <Button variant="outline" size="sm" disabled={result.page <= 1} nativeButton={false} render={result.page > 1 ? <Link href={pageHref(result.page - 1)} /> : <span />}>
            <ChevronLeftIcon /> Previous
          </Button>
          <span className="text-sm text-muted-foreground tabular-nums">Page {result.page} of {result.pages}</span>
          <Button variant="outline" size="sm" disabled={result.page >= result.pages} nativeButton={false} render={result.page < result.pages ? <Link href={pageHref(result.page + 1)} /> : <span />}>
            Next <ChevronRightIcon />
          </Button>
        </nav>
      ) : null}
    </div>
  )
}
