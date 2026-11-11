import Link from "next/link"
import { OtterEmpty } from "@/components/naruvi/otter"
import { AddCompanyDialog } from "@/components/companies/company-dialogs"
import { Suspense } from "react"
import { connection } from "next/server"
import { ArrowUpRightIcon, BellRingIcon, Building2Icon, ChevronRightIcon } from "lucide-react"
import { ClearFilters, SearchBox, UrlSelect } from "@/components/list-toolbar"
import { Badge } from "@/components/ui/badge"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import type { Status } from "@/lib/stages"
import { cn } from "@/lib/utils"
import { ago } from "@/components/runs/labels"
import { PageHeader } from "@/components/page-header"
import { EntryLogo } from "@/components/profile/entry-logo"
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Skeleton } from "@/components/ui/skeleton"
import { COMPANY_FILTERS, COMPANY_SORTS, listCompanies, type CompanyFilter, type CompanySort } from "@/server/companies/repository"
import { useTranslations } from "next-intl"
import { getLocale, getNow, getTranslations } from "next-intl/server"

export async function generateMetadata() {
  return { title: (await getTranslations("nav.items"))("companies.title") }
}

export default function CompaniesPage({ searchParams }: PageProps<"/[locale]/companies">) {
  const t = useTranslations("companies")
  return (
    <>
      <PageHeader title={t("title")} description={t("description")} actions={<AddCompanyDialog />} />
      <Suspense fallback={<div className="@container"><div className="grid gap-4 @2xl:grid-cols-2 @5xl:grid-cols-3 @7xl:grid-cols-4">{Array.from({ length: 6 }, (_, index) => <Skeleton key={index} className="h-44 rounded-xl" />)}</div></div>}>
        <CompanyList searchParams={searchParams} />
      </Suspense>
    </>
  )
}

async function CompanyList({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await connection()
  const params = await searchParams
  const one = (value: string | string[] | undefined) => (typeof value === "string" ? value : undefined)
  const query = one(params.q)?.slice(0, 200)
  const sort = Object.hasOwn(COMPANY_SORTS, one(params.sort) ?? "") ? (one(params.sort) as CompanySort) : "recent"
  const filter = Object.hasOwn(COMPANY_FILTERS, one(params.show) ?? "") ? (one(params.show) as CompanyFilter) : "all"
  const rows = await listCompanies(query, { sort, filter })
  const [t, tl, locale, now] = await Promise.all([getTranslations("companies"), getTranslations("labels"), getLocale(), getNow()])
  return (
    <div className="@container grid gap-5">
      <div className="flex flex-wrap items-center gap-2">
        <SearchBox placeholder={t("search")} />
        <UrlSelect name="show" label={t("show")} options={(Object.keys(COMPANY_FILTERS) as CompanyFilter[]).map((value) => ({ value, label: t(`filters.${value}`) }))} className="w-48" />
        <ClearFilters names={["q", "show"]} />
        <div className="ms-auto flex items-center gap-2">
          <span className="text-sm text-muted-foreground tabular-nums">{t("count", { count: rows.length })}</span>
          <UrlSelect name="sort" label={t("sort")} options={(Object.keys(COMPANY_SORTS) as CompanySort[]).map((value) => ({ value, label: t(`sorts.${value}`) }))} className="w-40" />
        </div>
      </div>
      {rows.length ? (
        <div className="grid gap-4 @2xl:grid-cols-2 @5xl:grid-cols-3 @7xl:grid-cols-4">
          {rows.map((company) => {
            const stage = furthest(company.statuses as Status[], tl)
            return (
            <Card key={company.id} role="article" aria-labelledby={`company-${company.id}`} className="group relative gap-0 pt-4 text-base transition-[box-shadow] duration-150 ease-(--ease-out) hover:ring-foreground/25 focus-within:ring-2 focus-within:ring-ring [--card-spacing:--spacing(4)]">
              <CardHeader className="block">
                <div className="flex items-start gap-3">
                  <EntryLogo path={company.logoPath} name={company.name} size={40} morph={`company-${company.id}`} />
                  <div className="min-w-0 flex-1">
                    <h2 id={`company-${company.id}`} className="leading-snug font-medium wrap-anywhere">
                      <Link href={`/companies/${company.id}`} className="after:absolute after:inset-0 after:rounded-xl focus-visible:outline-none">{company.name}</Link>
                    </h2>
                    {company.website ? (
                      <a href={company.website} target="_blank" rel="noreferrer" aria-label={t("visit", { name: company.name })} className="relative z-10 inline-flex min-h-6 max-w-full items-center gap-1 rounded-sm text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
                        <span className="truncate">{new URL(company.website).hostname.replace(/^www\./, "")}</span>
                        <ArrowUpRightIcon aria-hidden="true" className="size-3.5 shrink-0" />
                      </a>
                    ) : <p className="text-sm leading-6 text-muted-foreground">{t("noWebsite")}</p>}
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    {company.watching ? (
                      <Tooltip>
                        <TooltipTrigger render={<span className="relative z-10 grid size-6 place-content-center rounded-full text-muted-foreground" />}>
                          <BellRingIcon className="size-3.5" aria-label={t("watching")} />
                        </TooltipTrigger>
                        <TooltipContent>{t("watchingHint")}</TooltipContent>
                      </Tooltip>
                    ) : null}
                    {stage ? <Badge variant={stage.variant} className={cn("font-normal", stage.className)}>{stage.label}</Badge> : null}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="flex flex-1 flex-col pt-3 pb-4">
                <p className={cn("line-clamp-2 text-sm leading-relaxed first-letter:uppercase", company.description ? "text-foreground/80" : "text-muted-foreground")}>
                  {company.description || t("noOverview")}
                </p>
              </CardContent>
              <CardFooter className="justify-between gap-3 bg-muted/30 py-2.5">
                <dl className="flex flex-wrap items-center gap-x-4 gap-y-1">
                  <Count label={t("counts.jobs", { count: company.jobs })} value={company.jobs} />
                  <Count label={t("counts.active", { count: company.active })} value={company.active} />
                  <Count label={t("counts.sent", { count: company.sent })} value={company.sent} />
                </dl>
                <span className="flex items-center gap-2 text-xs text-muted-foreground">
                  <time dateTime={company.last.toISOString()} title={company.last.toLocaleString(locale)}>{ago(company.last, now.getTime(), locale)}</time>
                  <ChevronRightIcon aria-hidden="true" className="size-4 shrink-0 group-hover:text-foreground group-focus-within:text-foreground" />
                </span>
              </CardFooter>
            </Card>
            )
          })}
        </div>
      ) : (
        query || filter !== "all" ? (
          <Empty className="border">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Building2Icon />
              </EmptyMedia>
              <EmptyTitle>{t("empty.noMatch")}</EmptyTitle>
              <EmptyDescription>{!query && filter === "watching" ? t("empty.noWatching") : query ? t("empty.query", { query }) : t("empty.filter")}</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <OtterEmpty pose="finding-opportunity" title={t("empty.title")}>
            {t("empty.body")}
          </OtterEmpty>
        )
      )}
    </div>
  )
}

function Count({ label, value }: { label: string; value: number }) {
  return (
    <div className={cn("flex items-baseline gap-1 text-sm", !value && "text-muted-foreground/70")}>
      <dt className="order-2 text-muted-foreground">{label}</dt>
      <dd className={cn("tabular-nums", value ? "font-medium" : "")}>{value}</dd>
    </div>
  )
}

/** The furthest an open application here has got, for the card's badge. */
const ORDER: Status[] = ["offer", "interviewing", "submitted", "ready", "generated", "analyzed", "parsed", "draft"]
function furthest(statuses: Status[], tl: Awaited<ReturnType<typeof getTranslations<"labels">>>) {
  const open = ORDER.find((status) => statuses.includes(status))
  if (open) return { label: tl(`status.${open}`), variant: (open === "offer" || open === "interviewing" ? "default" : "secondary") as "default" | "secondary", className: "" }
  if (statuses.length) return { label: tl("column.closed"), variant: "outline" as const, className: "text-muted-foreground" }
  return null
}

