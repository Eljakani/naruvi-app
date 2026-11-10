import Link from "next/link"
import { OtterEmpty } from "@/components/naruvi/otter"
import { Suspense } from "react"
import { connection } from "next/server"
import { ChevronLeftIcon, ChevronRightIcon, MapPinIcon, PlusIcon, SearchIcon } from "lucide-react"
import { PageHeader } from "@/components/page-header"
import { EntryLogo } from "@/components/profile/entry-logo"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Skeleton } from "@/components/ui/skeleton"
import { FitRing } from "@/components/applications/fit-ring"
import { GoalFitBadge } from "@/components/applications/goal-fit"
import { goalFit } from "@/lib/search-goals"
import { getProfile } from "@/server/profile/repository"
import { ClearFilters, SearchBox, UrlSelect } from "@/components/list-toolbar"
import { CONTRACT_LABEL, SENIORITY_LABEL, WORK_MODE_LABEL } from "@/lib/job-labels"
import { cn } from "@/lib/utils"
import { AddJobDialog } from "@/components/jobs/job-reader"
import { JobLeads } from "@/components/jobs/job-leads"
import { allTags } from "@/server/companies/repository"
import { newLeads } from "@/server/jobs/leads"
import { JOB_GOALS, JOB_SORTS, JOB_STAGES, jobFacets, searchJobs } from "@/server/jobs/search"
import { titled } from "@/i18n/metadata"
import { useTranslations } from "next-intl"
import { getLocale, getTranslations } from "next-intl/server"

export const generateMetadata = titled("jobs")

type Search = Promise<Record<string, string | string[] | undefined>>
const one = (value: string | string[] | undefined) => (typeof value === "string" ? value : undefined)
const FILTERS = ["q", "tag", "workMode", "contract", "seniority", "stage", "goal", "sort"]

export default function JobsPage({ searchParams }: PageProps<"/[locale]/jobs">) {
  const t = useTranslations("jobs")
  return (
    <>
      <PageHeader
        title={t("title")}
        description={t("description")}
        actions={
          <AddJobDialog trigger={<Button><PlusIcon /> {t("addJob")}</Button>} />
        }
      />
      <Suspense fallback={<div className="grid gap-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-20 rounded-xl" />)}</div>}>
        <JobList searchParams={searchParams} />
      </Suspense>
    </>
  )
}

const BOARD_LABEL: Record<string, string> = { linkedin: "LinkedIn", greenhouse: "Greenhouse", lever: "Lever", ashby: "Ashby", smartrecruiters: "SmartRecruiters", workday: "Workday" }
const BOARD_KEY = { manual: "manual", generic: "generic", "job-board": "jobBoard" } as const

const options = (all: string, counts: Map<string, number>, labels: Record<string, string>, word: (key: string) => string) => [
  { value: "all", label: all },
  ...Object.keys(labels).filter((key) => counts.has(key)).map((key) => ({ value: key, label: `${word(key)} (${counts.get(key)})` })),
]

async function JobList({ searchParams }: { searchParams: Search }) {
  const [t, tl, locale] = await Promise.all([getTranslations("jobs"), getTranslations("labels"), getLocale()])
  await connection()
  const params = await searchParams
  const pick = <T extends string>(value: string | undefined, allowed: Record<T, string>) => (value && Object.hasOwn(allowed, value) ? (value as T) : undefined)
  const filter = {
    q: one(params.q)?.slice(0, 200),
    workMode: pick(one(params.workMode), WORK_MODE_LABEL),
    contract: pick(one(params.contract), CONTRACT_LABEL),
    seniority: pick(one(params.seniority), SENIORITY_LABEL),
    stage: pick(one(params.stage), JOB_STAGES) ?? "new",
    goal: pick(one(params.goal), JOB_GOALS),
    sort: pick(one(params.sort), JOB_SORTS),
    page: Number(one(params.page)) || 1,
  }
  const [tags, leads, profile] = await Promise.all([allTags(), newLeads(), getProfile()])
  const tag = one(params.tag)
  const [result, facets] = await Promise.all([searchJobs({ ...filter, tag: tag && tags.some((item) => item.tag === tag) ? tag : undefined }), jobFacets()])
  if (!facets.total && !leads.length) {
    return (
      <OtterEmpty pose="finding-opportunity" title={t("first.title")} action={<AddJobDialog trigger={<Button><PlusIcon /> {t("first.add")}</Button>} />}>
        {t("first.body")}
      </OtterEmpty>
    )
  }
  const filtered = Boolean(filter.q || tag || filter.workMode || filter.contract || filter.seniority || filter.stage !== "all" || (filter.goal && filter.goal !== "all"))
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
        <SearchBox placeholder={t("search")} />
        {tags.length ? <UrlSelect name="tag" label={t("tag")} options={[{ value: "all", label: t("anyTag") }, ...tags.map((item) => ({ value: item.tag, label: `${item.tag} (${item.count})` }))]} /> : null}
        <UrlSelect name="stage" label={t("stage")} options={(Object.keys(JOB_STAGES) as (keyof typeof JOB_STAGES)[]).map((value) => ({ value, label: t(`stages.${value}`) }))} className="w-44" />
        {facets.goal.size ? <UrlSelect name="goal" label={t("goal")} options={(Object.keys(JOB_GOALS) as (keyof typeof JOB_GOALS)[]).map((value) => ({ value, label: facets.goal.has(value) ? `${t(`goals.${value}`)} (${facets.goal.get(value)})` : t(`goals.${value}`) }))} className="w-44" /> : null}
        {facets.workMode.size ? <UrlSelect name="workMode" label={t("workMode")} options={options(t("anyWorkMode"), facets.workMode, WORK_MODE_LABEL, (key) => tl(`workMode.${key as keyof typeof WORK_MODE_LABEL & "remote"}`))} /> : null}
        {facets.contract.size ? <UrlSelect name="contract" label={t("contract")} options={options(t("anyContract"), facets.contract, CONTRACT_LABEL, (key) => tl(`contract.${key as "permanent"}`))} /> : null}
        {facets.seniority.size ? <UrlSelect name="seniority" label={t("seniority")} options={options(t("anySeniority"), facets.seniority, SENIORITY_LABEL, (key) => tl(`seniority.${key as "junior"}`))} /> : null}
        <ClearFilters names={FILTERS.filter((name) => name !== "sort")} />
        <div className="ms-auto flex items-center gap-2">
          <span className="text-sm text-muted-foreground tabular-nums">{filtered ? t("ofTotal", { count: result.total, total: facets.total }) : t("count", { count: facets.total })}</span>
          <UrlSelect name="sort" label={t("sort")} options={(Object.keys(JOB_SORTS) as (keyof typeof JOB_SORTS)[]).map((value) => ({ value, label: t(`sorts.${value}`) }))} className="w-36" />
        </div>
      </div>
      {result.jobs.length ? (
        <div className="grid gap-2">
          {result.jobs.map((job) => {
            const closed = Boolean(job.archivedAt) || job.status === "rejected" || job.status === "withdrawn"
            const fit = profile && job.board !== "spontaneous" ? goalFit(profile.goals, job, profile.location) : null
            const details = [job.insights?.workMode && job.insights.workMode in WORK_MODE_LABEL && tl(`workMode.${job.insights.workMode as "remote"}`), job.insights?.contract && job.insights.contract in CONTRACT_LABEL && tl(`contract.${job.insights.contract as "permanent"}`), job.insights?.seniority && job.insights.seniority in SENIORITY_LABEL && tl(`seniority.${job.insights.seniority as "junior"}`)].filter(Boolean)
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
                      <GoalFitBadge fit={fit} />
                    </div>
                  </div>
                  <div className="hidden items-center gap-2 sm:flex">
                    {job.applicationId ? <Badge variant={closed ? "outline" : job.status === "ready" ? "default" : "secondary"}>{job.archivedAt ? t("archived") : tl(`status.${job.status!}`)}</Badge> : <Badge variant="outline" className="font-normal text-muted-foreground">{t("notAnalyzed")}</Badge>}
                    {job.fit !== null ? <FitRing score={job.fit} size={32} /> : null}
                    <Badge variant="outline" className="font-mono text-[11px] uppercase">
                      {job.language}
                    </Badge>
                    <span className="hidden w-36 truncate text-end text-xs whitespace-nowrap text-muted-foreground lg:inline">{BOARD_LABEL[job.board] ?? (job.board in BOARD_KEY ? t(`boards.${BOARD_KEY[job.board as keyof typeof BOARD_KEY]}`) : job.board)} · {job.createdAt.toLocaleDateString(locale, { day: "numeric", month: "short" })}</span>
                  </div>
                  <ChevronRightIcon className="size-4 text-muted-foreground" />
                </Card>
              </Link>
            )
          })}
        </div>
      ) : (
        filter.stage === "new" && !filter.q ? (
          <OtterEmpty pose="finding-opportunity" title={t("nothingNew.title")} action={<Button variant="outline" nativeButton={false} render={<Link href="/applications" />}>{t("nothingNew.open")}</Button>}>
            {t("nothingNew.body")}
          </OtterEmpty>
        ) : (
          <Empty className="border">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <SearchIcon />
              </EmptyMedia>
              <EmptyTitle>{t("noMatch.title")}</EmptyTitle>
              <EmptyDescription>{filter.q ? t("noMatch.query", { query: filter.q }) : t("noMatch.filters")} {t("noMatch.hint")}</EmptyDescription>
            </EmptyHeader>
          </Empty>
        )
      )}
      {result.pages > 1 ? (
        <nav className="flex items-center justify-between gap-2" aria-label={t("pages")}>
          <Button variant="outline" size="sm" disabled={result.page <= 1} nativeButton={false} render={result.page > 1 ? <Link href={pageHref(result.page - 1)} /> : <span />}>
            <ChevronLeftIcon /> {t("previous")}
          </Button>
          <span className="text-sm text-muted-foreground tabular-nums">{t("page", { page: result.page, pages: result.pages })}</span>
          <Button variant="outline" size="sm" disabled={result.page >= result.pages} nativeButton={false} render={result.page < result.pages ? <Link href={pageHref(result.page + 1)} /> : <span />}>
            {t("next")} <ChevronRightIcon />
          </Button>
        </nav>
      ) : null}
    </div>
  )
}
