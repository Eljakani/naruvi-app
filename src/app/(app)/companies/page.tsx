import Link from "next/link"
import { Suspense } from "react"
import { connection } from "next/server"
import { Building2Icon, ChevronRightIcon } from "lucide-react"
import { SearchBox } from "@/components/list-toolbar"
import { PageHeader } from "@/components/page-header"
import { EntryLogo } from "@/components/profile/entry-logo"
import { Card } from "@/components/ui/card"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Skeleton } from "@/components/ui/skeleton"
import { listCompanies } from "@/server/companies/repository"

export const metadata = { title: "Companies" }

export default function CompaniesPage({ searchParams }: PageProps<"/companies">) {
  return (
    <>
      <PageHeader title="Companies" description="Every company you’ve looked at, with all its jobs and your applications there." />
      <Suspense fallback={<Skeleton className="h-80 rounded-xl" />}>
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
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <SearchBox placeholder="Search companies…" />
        <span className="ml-auto text-sm text-muted-foreground tabular-nums">{rows.length} compan{rows.length === 1 ? "y" : "ies"}</span>
      </div>
      {rows.length ? (
        <Card className="gap-0 divide-y py-0">
          {rows.map((company) => (
            <Link key={company.id} href={`/companies/${company.id}`} className="group flex items-center gap-4 px-4 py-3 hover:bg-muted/40 focus-visible:bg-muted/40 focus-visible:outline-none">
              <EntryLogo path={company.logoPath} name={company.name} size={36} />
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{company.name}</div>
                <div className="truncate text-xs text-muted-foreground">{company.website ? new URL(company.website).hostname : "No website yet"}</div>
              </div>
              <dl className="hidden gap-6 text-right text-xs sm:flex">
                <Count label="Jobs" value={company.jobs} />
                <Count label="Active" value={company.active} />
                <Count label="Sent" value={company.sent} />
              </dl>
              <span className="hidden w-20 text-right text-xs text-muted-foreground md:inline">{company.last.toLocaleDateString(undefined, { day: "numeric", month: "short" })}</span>
              <ChevronRightIcon className="size-4 text-muted-foreground opacity-50 group-hover:opacity-100" />
            </Link>
          ))}
        </Card>
      ) : (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Building2Icon />
            </EmptyMedia>
            <EmptyTitle>{query ? "No matching company" : "No companies yet"}</EmptyTitle>
            <EmptyDescription>{query ? `Nothing matches “${query}”.` : "Companies appear here when you add a job."}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}
    </div>
  )
}

function Count({ label, value }: { label: string; value: number }) {
  return (
    <div className="w-12">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-sm font-medium tabular-nums">{value}</dd>
    </div>
  )
}
