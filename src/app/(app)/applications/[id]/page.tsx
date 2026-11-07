import Link from "next/link"
import { notFound } from "next/navigation"
import { scheduleResearch } from "@/server/research/auto"
import { Suspense } from "react"
import { after, connection } from "next/server"
import { ArchiveIcon, ArrowLeftIcon, ExternalLinkIcon } from "lucide-react"
import { AnalysisView } from "@/components/applications/analysis-view"
import { AnalyzeButton } from "@/components/applications/analyze-button"
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

export default function ApplicationPage({ params }: PageProps<"/applications/[id]">) {
  return (
    <Suspense fallback={<Skeleton className="h-96 rounded-xl" />}>
      <ApplicationDetail params={params} />
    </Suspense>
  )
}

async function ApplicationDetail({ params }: { params: Promise<{ id: string }> }) {
  await connection()
  const { id } = await params
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound()
  const [application, events, mail, mailConnected, people, contactOptions] = await Promise.all([getApplication(id), listEvents(id), mailFor(id), hasMailbox(), contactsForApplication(id), listContacts()])
  const drafts = await db.select({ kind: documents.kind, language: documents.language, updatedAt: documents.updatedAt, current: documents.currentRevisionId }).from(documents).where(eq(documents.applicationId, id))
  if (!application) notFound()
  // Opening the application counts as reading its emails.
  if (mail.some((message) => !message.readAt)) after(() => markRead(id))
  const { job } = application
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
            <Link href={`/jobs/${job.id}`} className="inline-flex items-center gap-1 hover:underline">
              job description <ExternalLinkIcon className="size-3" />
            </Link>
          </p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <StatusControl id={application.id} status={application.status} />
        <NextStep id={application.id} nextStep={application.nextStep} due={application.nextStepDue?.toISOString() ?? null} />
        <ComposeEmail applicationId={application.id} connected={mailConnected} hasReplies={mail.some((message) => message.direction === "in")} />
        <div className="ms-auto flex flex-wrap items-center gap-2">
          {job.board === "spontaneous" ? null : <AnalyzeButton jobId={job.id} label="Re-analyze" variant="outline" />}
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
            <MailThread messages={mail} />
          </div>
        ) : null}
        <ApplicationPeople applicationId={application.id} people={people} options={contactOptions.map((contact) => ({ id: contact.id, name: contact.name, title: contact.title, company: contact.company }))} />
      </div>
      {job.board === "spontaneous" ? (
        <Card>
          <CardHeader>
            <CardTitle>Spontaneous application</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2 text-sm text-muted-foreground">
            <p>There’s no posting to match, so there’s no fit score. Your CV leads with your strongest verified entries, and the letter explains why you’d like to work at {job.company?.name ?? "this company"}.</p>
            <p>Draft the CV and the letter, then send them by email to the person linked here, or note that you reached out on LinkedIn by moving the application to Sent.</p>
          </CardContent>
        </Card>
      ) : application.analysis ? <AnalysisView analysis={application.analysis} facts={application.facts} research={{ applicationId: application.id, jobId: job.id, company: job.company?.name ?? "the company", language: application.language, initial: (job.company?.research ?? null) as unknown as Research | null, researching }} /> : <p className="text-sm text-muted-foreground">Not analyzed yet.</p>}
      {events.length ? (
        <Card>
          <CardHeader>
            <CardTitle>History</CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="grid gap-2">
              {events.map((event) => (
                <li key={event.id} className="flex items-center justify-between gap-3 text-sm">
                  <span>
                    {event.fromStatus ? `${STATUS_LABEL[event.fromStatus]} → ` : ""}
                    {STATUS_LABEL[event.toStatus]}
                    {event.actor === "system" ? <span className="text-muted-foreground"> · automatic</span> : null}
                  </span>
                  <time className="text-muted-foreground" dateTime={event.createdAt.toISOString()}>
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
