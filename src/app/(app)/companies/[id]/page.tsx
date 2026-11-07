import Link from "next/link"
import { AddWebsiteButton } from "@/components/companies/company-dialogs"
import { notFound } from "next/navigation"
import { Suspense } from "react"
import { connection } from "next/server"
import { ArrowLeftIcon, CalendarClockIcon, ExternalLinkIcon, PlusIcon } from "lucide-react"
import { FitRing } from "@/components/applications/fit-ring"
import { AddJobDialog } from "@/components/jobs/job-reader"
import { EntryLogo } from "@/components/profile/entry-logo"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { STATUS_LABEL } from "@/lib/stages"
import { getCompany } from "@/server/companies/repository"
import { contactsForCompany } from "@/server/contacts/repository"
import type { CompanyResearch } from "@/server/research/brief"

export const metadata = { title: "Company" }

const SENT = new Set(["submitted", "interviewing", "offer", "rejected"])

export default function CompanyPage({ params }: PageProps<"/companies/[id]">) {
  return (
    <Suspense fallback={<Skeleton className="h-96 rounded-xl" />}>
      <CompanyDetail params={params} />
    </Suspense>
  )
}

async function CompanyDetail({ params }: { params: Promise<{ id: string }> }) {
  await connection()
  const { id } = await params
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound()
  const [company, people] = await Promise.all([getCompany(id), contactsForCompany(id)])
  if (!company) notFound()
  const research = company.research as CompanyResearch | null
  const sent = company.jobs.filter((job) => job.status && SENT.has(job.status))
  const host = company.website ? new URL(company.website).hostname : null

  return (
    <div className="grid gap-4">
      <Button variant="ghost" size="sm" className="w-fit" nativeButton={false} render={<Link href="/companies" />}>
        <ArrowLeftIcon /> Companies
      </Button>
      <div className="flex flex-wrap items-center gap-4">
        <EntryLogo path={company.logoPath} name={company.name} size={56} morph={`company-${company.id}`} />
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-2xl font-semibold tracking-tight">{company.name}</h1>
          <p className="text-sm text-muted-foreground">
            {company.jobs.length} job{company.jobs.length === 1 ? "" : "s"} · {company.jobs.filter((job) => job.applicationId).length} application{company.jobs.filter((job) => job.applicationId).length === 1 ? "" : "s"}
            {host ? (
              <>
                {" · "}
                <a href={company.website!} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:underline">
                  {host} <ExternalLinkIcon className="size-3" />
                </a>
              </>
            ) : (
              <span className="ms-2 inline-flex align-middle"><AddWebsiteButton companyId={company.id} companyName={company.name} /></span>
            )}
          </p>
        </div>
        <AddJobDialog trigger={<Button variant="outline"><PlusIcon /> Add a job</Button>} />
      </div>

      {sent.length ? (
        <Alert>
          <CalendarClockIcon />
          <AlertTitle>You’ve applied here before</AlertTitle>
          <AlertDescription>
            {sent.map((job) => `${job.title} (${STATUS_LABEL[job.status!]}${job.updatedAt ? `, ${job.updatedAt.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}` : ""})`).join(" · ")}
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <Card className="h-fit gap-0 py-0">
          <CardHeader className="border-b py-3">
            <CardTitle className="text-sm">Jobs and applications</CardTitle>
          </CardHeader>
          <ul className="divide-y">
            {company.jobs.map((job) => {
              const closed = Boolean(job.archivedAt) || job.status === "rejected" || job.status === "withdrawn"
              return (
                <li key={job.id}>
                  <Link href={job.applicationId ? `/applications/${job.applicationId}` : `/jobs/${job.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/40">
                    <div className="min-w-0 flex-1">
                      <div className={closed ? "truncate font-medium text-muted-foreground" : "truncate font-medium"}>{job.title}</div>
                      <div className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                        {job.location ? <span>{job.location}</span> : null}
                        <span>Added {job.createdAt.toLocaleDateString(undefined, { day: "numeric", month: "short" })}</span>
                        {job.nextStep && !closed ? <span>· Next: {job.nextStep}</span> : null}
                        {job.tags.map((tag) => <Badge key={tag} variant="outline" className="h-4 px-1 text-[11px] font-normal">{tag}</Badge>)}
                      </div>
                    </div>
                    {job.applicationId ? <Badge variant={closed ? "outline" : job.status === "ready" ? "default" : "secondary"}>{job.archivedAt ? "Archived" : STATUS_LABEL[job.status!]}</Badge> : <Badge variant="outline" className="font-normal text-muted-foreground">Not analyzed</Badge>}
                    {job.fit !== null ? <FitRing score={job.fit} size={32} /> : <span className="w-8" />}
                  </Link>
                </li>
              )
            })}
          </ul>
        </Card>

        <div className="grid h-fit gap-4">
        {people.length ? (
          <Card className="gap-0 py-0">
            <CardHeader className="border-b py-3">
              <CardTitle className="text-sm">People at {company.name}</CardTitle>
            </CardHeader>
            <ul className="divide-y text-sm">
              {people.map((person) => (
                <li key={person.id} className="px-4 py-2">
                  <p className="truncate font-medium">{person.name}</p>
                  <p className="truncate text-xs text-muted-foreground">{[person.title, person.email].filter(Boolean).join(" · ") || "No details yet"}</p>
                </li>
              ))}
            </ul>
            <Link href="/contacts" className="border-t px-4 py-2 text-xs text-muted-foreground hover:text-foreground">All contacts</Link>
          </Card>
        ) : null}
        <Card className="h-fit">
          <CardHeader>
            <CardTitle className="text-sm">About {company.name}</CardTitle>
            <CardDescription className="text-xs">{research ? `From ${research.sources.length} source${research.sources.length === 1 ? "" : "s"}, ${new Date(research.generatedAt).toLocaleDateString(undefined, { day: "numeric", month: "short" })}` : "Research runs in the background when you analyze a job here."}</CardDescription>
          </CardHeader>
          {research ? (
            <CardContent className="grid gap-3 text-sm">
              {research.about.slice(0, 2).map((item) => <p key={item.text} className="line-clamp-4 text-muted-foreground">{item.text}</p>)}
              {research.facts.length ? (
                <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
                  {research.facts.slice(0, 6).map((fact) => (
                    <div key={fact.label} className="contents">
                      <dt className="text-muted-foreground">{fact.label}</dt>
                      <dd>{fact.value}</dd>
                    </div>
                  ))}
                </dl>
              ) : null}
              {research.sources.length ? (
                <ul className="grid gap-1 text-xs">
                  {research.sources.slice(0, 4).map((source) => (
                    <li key={source.url} className="truncate">
                      <a href={source.url} target="_blank" rel="noreferrer" className="text-muted-foreground hover:text-foreground hover:underline">{source.title || source.url}</a>
                    </li>
                  ))}
                </ul>
              ) : null}
            </CardContent>
          ) : null}
        </Card>
        </div>
      </div>
    </div>
  )
}
