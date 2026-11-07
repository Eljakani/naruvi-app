import Link from "next/link"
import { notFound } from "next/navigation"
import { scheduleResearch } from "@/server/research/auto"
import { Suspense } from "react"
import { after, connection } from "next/server"
import { ArchiveIcon, ArrowLeftIcon, ScanSearchIcon } from "lucide-react"
import { JobOverview } from "@/components/jobs/job-overview"
import { AnalysisView } from "@/components/applications/analysis-view"
import { AnalyzeButton } from "@/components/applications/analyze-button"
import { ApplicationProgress } from "@/components/applications/application-progress"
import { ApplicationDocuments } from "@/components/applications/application-documents"
import { db } from "@/server/db/client"
import { documents } from "@/server/db/schema"
import { eq } from "drizzle-orm"
import { EntryLogo } from "@/components/profile/entry-logo"
import { ArchiveButton, NextStep } from "@/components/tracking/next-step"
import { StatusControl } from "@/components/tracking/status-control"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { STATUS_LABEL } from "@/lib/stages"
import { listEvents } from "@/server/tracking/service"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { getApplication } from "@/server/applications/repository"
import { ComposeEmail } from "@/components/mail/compose-email"
import { MailThread } from "@/components/mail/mail-thread"
import { ApplicationPeople } from "@/components/contacts/application-people"
import { contactsForApplication, listContacts } from "@/server/contacts/repository"
import { hasMailbox } from "@/server/mail/account"
import { mailFor, markRead } from "@/server/mail/classify"
import type { CompanyResearch as Research } from "@/server/research/brief"

export const metadata = { title: "Application" }

export default function ApplicationPage({ params, searchParams }: PageProps<"/applications/[id]">) {
  return (
    <Suspense fallback={<Skeleton className="h-96 rounded-xl" />}>
      <ApplicationDetail params={params} searchParams={searchParams} />
    </Suspense>
  )
}

async function ApplicationDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await connection()
  const { id } = await params
  const { tab: tabParam } = await searchParams
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound()
  const [application, events, mail, mailConnected, people, contactOptions] = await Promise.all([getApplication(id), listEvents(id), mailFor(id), hasMailbox(), contactsForApplication(id), listContacts()])
  const drafts = await db.select({ kind: documents.kind, language: documents.language, updatedAt: documents.updatedAt, current: documents.currentRevisionId }).from(documents).where(eq(documents.applicationId, id))
  if (!application) notFound()
  // Opening the application counts as reading its emails.
  if (mail.some((message) => !message.readAt)) after(() => markRead(id))
  const { job } = application
  // Not analyzed yet: open on the posting. Otherwise on the analysis, unless asked.
  const tab = tabParam === "overview" || (!application.analysis && tabParam !== "analysis") ? "overview" : "analysis"
  // No research yet: start it in the background; the card fills in when it lands.
  const researching = Boolean(job.company) && !job.company?.research
  if (researching) scheduleResearch(job.id)
  return (
    <div className="grid gap-4">
      <Button variant="ghost" size="sm" className="w-fit" nativeButton={false} render={<Link href="/applications" />}>
        <ArrowLeftIcon /> Applications
      </Button>
      <div className="flex items-start gap-4">
        <EntryLogo path={job.company?.logoPath} name={job.company?.name ?? "?"} size={56} morph={`application-${id}`} />
        <div className="grid min-w-0 flex-1 gap-1">
          <h1 className="text-2xl font-semibold tracking-tight text-balance">{job.title}</h1>
          <p className="text-sm text-muted-foreground">
            {job.company ? <Link href={`/companies/${job.company.id}`} className="font-medium text-foreground hover:underline">{job.company.name}</Link> : null}
            {job.location ? ` · ${job.location}` : ""} ·{" "}
            <Link href={`/applications/${application.id}?tab=overview`} scroll={false} className="hover:underline">
              job posting
            </Link>
          </p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <StatusControl id={application.id} status={application.status} company={job.company?.name ?? ""} title={job.title} />
        <NextStep id={application.id} nextStep={application.nextStep} due={application.nextStepDue?.toISOString() ?? null} />
        <ComposeEmail applicationId={application.id} connected={mailConnected} hasReplies={mail.some((message) => message.direction === "in")} />
        <div className="ms-auto flex flex-wrap items-center gap-2">
          {job.board === "spontaneous" || !application.analysis ? null : <AnalyzeButton jobId={job.id} label="Check again" variant="outline" />}
          <ArchiveButton id={application.id} archived={Boolean(application.archivedAt)} />
        </div>
      </div>
      {application.archivedAt ? (
        <Alert>
          <ArchiveIcon />
          <AlertTitle>Archived on {application.archivedAt.toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" })}</AlertTitle>
          <AlertDescription>It’s hidden from the board and the dashboard. Restore it to work on it again.</AlertDescription>
        </Alert>
      ) : null}
      <ApplicationProgress applicationId={application.id} jobId={job.id} status={application.status} language={application.language} spontaneous={job.board === "spontaneous"} sourceUrl={job.sourceUrl} cvDraft={drafts.some((doc) => doc.kind === "cv" && Boolean(doc.current))} />
      <ApplicationDocuments
        applicationId={application.id}
        language={application.language}
        coverDecision={(application.analysis?.coverLetter.decision as "required" | "optional" | "not_requested" | "not_mentioned" | undefined) ?? null}
        coverEvidence={application.analysis?.coverLetter.evidence ?? null}
        cv={drafts.find((doc) => doc.kind === "cv" && doc.current && doc.language === application.language) ?? null}
        letter={drafts.find((doc) => doc.kind === "cover_letter" && doc.current && doc.language === application.language) ?? null}
      />
      <div className={mail.length ? "grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]" : "grid gap-4"}>
        {mail.length ? (
          <div className="grid min-w-0 content-start gap-4">
            <MailThread messages={mail} applicationId={application.id} connected={mailConnected} status={application.status} />
          </div>
        ) : null}
        <ApplicationPeople applicationId={application.id} people={people} options={contactOptions.map((contact) => ({ id: contact.id, name: contact.name, title: contact.title, company: contact.company }))} />
      </div>
      {job.board === "spontaneous" ? null : (
        <nav className="flex w-fit rounded-lg bg-muted p-0.5" aria-label="Application sections">
          {([["overview", "Job posting"], ["analysis", application.analysis ? "Fit check" : "Fit check · not run yet"]] as const).map(([value, label]) => (
            <Link
              key={value}
              href={`/applications/${application.id}${value === "analysis" ? "" : "?tab=overview"}`}
              scroll={false}
              aria-current={tab === value ? "page" : undefined}
              className={tab === value ? "rounded-md bg-background px-3 py-1 text-xs font-medium shadow-xs" : "rounded-md px-3 py-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"}
            >
              {label}
            </Link>
          ))}
        </nav>
      )}
      {tab === "overview" && job.board !== "spontaneous" ? (
        <JobOverview job={job} />
      ) : !application.analysis && job.board !== "spontaneous" ? (
        <Card className="items-center border-dashed py-10 text-center">
          <CardContent className="grid max-w-md justify-items-center gap-3">
            <span className="grid size-11 place-content-center rounded-full bg-primary/10 text-primary"><ScanSearchIcon className="size-5" /></span>
            <p className="font-medium">See how well you fit, before you write anything</p>
            <p className="text-sm text-muted-foreground">Naruvi checks each requirement of the posting against your verified facts, then picks which entries to lead with on your CV.</p>
            <AnalyzeButton jobId={job.id} />
          </CardContent>
        </Card>
      ) : (
        job.board === "spontaneous" ? (
        <Card>
          <CardHeader>
            <CardTitle>Spontaneous application</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2 text-sm text-muted-foreground">
            <p>There’s no posting to match, so there’s no fit score. Your CV leads with your strongest verified entries, and the letter explains why you’d like to work at {job.company?.name ?? "this company"}.</p>
            <p>Draft the CV and the letter, then send them by email to the person linked here, or note that you reached out on LinkedIn by moving the application to Sent.</p>
          </CardContent>
        </Card>
      ) : application.analysis ? <AnalysisView analysis={application.analysis} facts={application.facts} research={{ applicationId: application.id, jobId: job.id, company: job.company?.name ?? "the company", language: application.language, initial: (job.company?.research ?? null) as unknown as Research | null, researching, logoPath: job.company?.logoPath ?? null }} /> : null
      )}
      {events.length ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">History</CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="relative grid gap-3 ps-5 before:absolute before:inset-y-1.5 before:start-[5px] before:w-px before:bg-border">
              {events.map((event, index) => (
                <li key={event.id} className="relative flex flex-wrap items-baseline justify-between gap-x-3 text-sm">
                  <span className={index === 0 ? "absolute -start-5 top-1.5 size-[11px] rounded-full border-2 border-background bg-primary" : "absolute -start-5 top-1.5 size-[11px] rounded-full border-2 border-background bg-muted-foreground/40"} aria-hidden />
                  <span>
                    {event.fromStatus ? <span className="text-muted-foreground">{STATUS_LABEL[event.fromStatus]} → </span> : null}
                    <span className="font-medium">{STATUS_LABEL[event.toStatus]}</span>
                    {event.actor === "system" ? <span className="text-muted-foreground"> · automatic</span> : null}
                  </span>
                  <time className="text-xs text-muted-foreground tabular-nums" dateTime={event.createdAt.toISOString()}>
                    {event.createdAt.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
                  </time>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}
