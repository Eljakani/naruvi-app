import Link from "next/link"
import { OtterEmpty } from "@/components/naruvi/otter"
import { AddCompanyDialog } from "@/components/companies/company-dialogs"
import { Suspense } from "react"
import { connection } from "next/server"
import { ArrowUpRightIcon, Building2Icon, ChevronRightIcon, Clock3Icon } from "lucide-react"
import { SearchBox } from "@/components/list-toolbar"
import { PageHeader } from "@/components/page-header"
import { EntryLogo } from "@/components/profile/entry-logo"
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Skeleton } from "@/components/ui/skeleton"
import { listCompanies } from "@/server/companies/repository"

export const metadata = { title: "Companies" }

export default function CompaniesPage({ searchParams }: PageProps<"/companies">) {
  return (
    <>
      <PageHeader title="Companies" description="Every company you’ve looked at, with all its jobs and your applications there." actions={<AddCompanyDialog />} />
      <Suspense fallback={<div className="@container"><div className="grid gap-4 @2xl:grid-cols-2 @5xl:grid-cols-3 @7xl:grid-cols-4">{Array.from({ length: 6 }, (_, index) => <Skeleton key={index} className="h-72 rounded-xl" />)}</div></div>}>
        <CompanyList searchParams={searchParams} />
      </Suspense>
    </>
  )
}

async function CompanyList({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await connection()
  const q = (await searchParams).q
  const query = typeof q === "string" ? q.slice(0, 200) : undefined
  const rows = await listCompanies(query)
  return (
    <div className="@container grid gap-5">
      <div className="flex flex-wrap items-center gap-2">
        <SearchBox placeholder="Search companies…" />
        <span className="ml-auto text-sm text-muted-foreground tabular-nums">{rows.length} compan{rows.length === 1 ? "y" : "ies"}</span>
      </div>
      {rows.length ? (
        <div className="grid gap-4 @2xl:grid-cols-2 @5xl:grid-cols-3 @7xl:grid-cols-4">
          {rows.map((company) => (
            <Card key={company.id} role="article" aria-labelledby={`company-${company.id}`} className="group relative gap-0 pt-5 text-base transition-[box-shadow] duration-150 ease-(--ease-out) hover:ring-foreground/25 focus-within:ring-2 focus-within:ring-ring [--card-spacing:--spacing(5)]">
              <CardHeader className="block">
                <div className="flex items-start gap-3">
                  <EntryLogo path={company.logoPath} name={company.name} size={48} morph={`company-${company.id}`} />
                  <div className="min-w-0 flex-1">
                    <h2 id={`company-${company.id}`} className="text-lg leading-snug font-medium wrap-anywhere">
                      <Link href={`/companies/${company.id}`} className="after:absolute after:inset-0 after:rounded-xl focus-visible:outline-none">{company.name}</Link>
                    </h2>
                    {company.website ? (
                      <a href={company.website} target="_blank" rel="noreferrer" aria-label={`Visit ${company.name} website (opens in a new tab)`} className="relative z-10 mt-1 inline-flex min-h-6 max-w-full items-center gap-1 rounded-sm text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
                        <span className="truncate">{new URL(company.website).hostname.replace(/^www\./, "")}</span>
                        <ArrowUpRightIcon aria-hidden="true" className="size-3.5 shrink-0" />
                      </a>
                    ) : <p className="mt-1 text-sm leading-6 text-muted-foreground">No website yet</p>}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="flex flex-1 flex-col gap-5 pt-4 pb-5">
                <p className="line-clamp-3 text-base leading-6 text-foreground/80 first-letter:uppercase">
                  {company.description || "Company overview not available yet."}
                </p>
                <p className="mt-auto flex items-center gap-1.5 text-sm text-muted-foreground">
                  <Clock3Icon aria-hidden="true" className="size-3.5 shrink-0" />
                  Last activity <time dateTime={company.last.toISOString()}>{company.last.toLocaleDateString(undefined, { day: "numeric", month: "short" })}</time>
                </p>
              </CardContent>
              <CardFooter className="justify-between gap-3 bg-muted/30 py-3">
                <dl className="flex flex-wrap items-center gap-x-4 gap-y-2">
                  <Count label={company.jobs === 1 ? "job" : "jobs"} value={company.jobs} />
                  <Count label="active" value={company.active} />
                  <Count label="sent" value={company.sent} />
                </dl>
                <ChevronRightIcon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground group-hover:text-foreground group-focus-within:text-foreground" />
              </CardFooter>
            </Card>
          ))}
        </div>
      ) : (
        query ? (
          <Empty className="border">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Building2Icon />
              </EmptyMedia>
              <EmptyTitle>No matching company</EmptyTitle>
              <EmptyDescription>Nothing matches “{query}”.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <OtterEmpty pose="finding-opportunity" title="No companies yet">
            Each job you add brings its company here, with public facts and everything you’ve sent them.
          </OtterEmpty>
        )
      )}
    </div>
  )
}

function Count({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-baseline gap-1.5 text-sm">
      <dt className="order-2 text-muted-foreground">{label}</dt>
      <dd className="font-medium tabular-nums">{value}</dd>
    </div>
  )
}
