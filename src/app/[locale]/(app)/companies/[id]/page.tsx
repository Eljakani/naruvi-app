import Link from "next/link"
import { AddWebsiteButton } from "@/components/companies/company-dialogs"
import { notFound } from "next/navigation"
import { Suspense } from "react"
import { connection } from "next/server"
import { ArrowLeftIcon, CalendarClockIcon, ExternalLinkIcon, PlusIcon, SearchIcon } from "lucide-react"
import { FitRing } from "@/components/applications/fit-ring"
import { AddJobDialog } from "@/components/jobs/add-job-dialog"
import { EntryLogo } from "@/components/profile/entry-logo"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import type { Status } from "@/lib/stages"
import { getCompany } from "@/server/companies/repository"
import { contactsForCompany } from "@/server/contacts/repository"
import type { CompanyResearch } from "@/server/research/brief"
import { CompanyFacts } from "@/components/companies/company-facts"
import { ResearchCompanyButton } from "@/components/companies/research-company-button"
import AITextLoading from "@/components/kokonutui/ai-text-loading"
import { companyFactsEnabled, companyProfile } from "@/server/companies/profile"
import { FindPeople } from "@/components/companies/find-people"
import { startupSignal } from "@/lib/company-people"
import { roleGroups } from "@/server/contacts/role-groups"
import { CareersWatch } from "@/components/companies/careers-watch"
import type { CareersBoard } from "@/lib/careers-boards"
import { detectBoard } from "@/server/jobs/careers"
import { getLocale, getTranslations } from "next-intl/server"

export async function generateMetadata() {
  return { title: (await getTranslations("company"))("title") }
}

const SENT = new Set(["submitted", "interviewing", "offer", "rejected"])

export default function CompanyPage({ params }: PageProps<"/[locale]/companies/[id]">) {
  return (
    <Suspense fallback={<Skeleton className="h-96 rounded-xl" />}>
      <CompanyDetail params={params} />
    </Suspense>
  )
}

/** The startup guess as Find people's props: the reason when it is one, and whether the facts could tell at all. */
const startupProps = (signal: ReturnType<typeof startupSignal>) => ({ startup: signal.reason, startupKnown: signal.startup !== null })

async function CompanyDetail({ params }: { params: Promise<{ id: string }> }) {
  await connection()
  const { id } = await params
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound()
  const [company, people, suggested, roles] = await Promise.all([getCompany(id), contactsForCompany(id), detectBoard(id), roleGroups()])
  if (!company) notFound()
  const research = company.research as CompanyResearch | null
  const sent = company.jobs.filter((job) => job.status && SENT.has(job.status))
  const host = company.website ? new URL(company.website).hostname : null
  const [t, tl, locale] = await Promise.all([getTranslations("company"), getTranslations("labels"), getLocale()])
  const applied = company.jobs.filter((job) => job.applicationId).length

  return (
    <div className="@container grid gap-5">
      <Button variant="ghost" size="sm" className="w-fit" nativeButton={false} render={<Link href="/companies" />}>
        <ArrowLeftIcon /> {t("back")}
      </Button>
      <div className="flex flex-wrap items-center gap-4">
        <EntryLogo path={company.logoPath} name={company.name} size={56} morph={`company-${company.id}`} />
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-semibold tracking-tight wrap-anywhere">{company.name}</h1>
          <p className="text-sm text-muted-foreground">
            {t("summary", { jobs: company.jobs.length, applications: applied })}
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
        <div className="flex flex-wrap items-center gap-2">
          <ResearchCompanyButton companyId={company.id} name={company.name} website={company.website} researched={Boolean(research)} />
          <AddJobDialog trigger={<Button variant="outline"><PlusIcon /> {t("addJob")}</Button>} />
        </div>
      </div>

      {sent.length ? (
        <Alert>
          <CalendarClockIcon />
          <AlertTitle>{t("appliedBefore")}</AlertTitle>
          <AlertDescription>
            {sent.map((job) => `${job.title} (${tl(`status.${job.status as Status}`)}${job.updatedAt ? `, ${job.updatedAt.toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric" })}` : ""})`).join(" · ")}
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="grid items-start gap-5 @4xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <div className="grid min-w-0 gap-5">
          <Card className="h-fit gap-0 py-0">
            <CardHeader className="border-b py-3">
              <CardTitle>{t("jobsTitle")} <span className="ms-1 font-normal text-muted-foreground">{company.jobs.length}</span></CardTitle>
            </CardHeader>
            {!company.jobs.length ? <p className="px-4 py-5 text-sm leading-relaxed text-muted-foreground">{t("noJobs")}</p> : null}
            <ul className="divide-y">
              {company.jobs.map((job) => {
                const closed = Boolean(job.archivedAt) || job.status === "rejected" || job.status === "withdrawn"
                return (
                  <li key={job.id}>
                    <Link href={job.applicationId ? `/applications/${job.applicationId}` : `/jobs/${job.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/40">
                      <div className="min-w-0 flex-1">
                        <div className={closed ? "font-medium text-muted-foreground wrap-anywhere" : "font-medium wrap-anywhere"}>{job.title}</div>
                        <div className="mt-1 flex flex-wrap items-center gap-x-2 text-sm text-muted-foreground">
                          {job.location ? <span>{job.location}</span> : null}
                          <span>{t("added", { date: job.createdAt.toLocaleDateString(locale, { day: "numeric", month: "short" }) })}</span>
                          {job.nextStep && !closed ? <span>· {t("next", { step: job.nextStep })}</span> : null}
                          {job.tags.map((tag) => <Badge key={tag} variant="outline" className="h-4 px-1 text-[11px] font-normal">{tag}</Badge>)}
                        </div>
                      </div>
                      {job.applicationId ? <Badge variant={closed ? "outline" : job.status === "ready" ? "default" : "secondary"}>{job.archivedAt ? t("archived") : tl(`status.${job.status as Status}`)}</Badge> : <Badge variant="outline" className="font-normal text-muted-foreground">{t("notAnalyzed")}</Badge>}
                      {job.fit !== null ? <FitRing score={job.fit} size={32} /> : null}
                    </Link>
                  </li>
                )
              })}
            </ul>
          </Card>
          <CompanyOverview research={research} name={company.name} t={t} locale={locale} />
        </div>
        <div className="grid min-w-0 gap-5">
          <Suspense fallback={<Card><CardContent><AITextLoading texts={[t("loading.records"), t("loading.wikidata"), t("loading.registry")]} label={t("loading.label")} className="text-sm" /></CardContent></Card>}>
            <Facts company={company} />
          </Suspense>
          <CareersWatch companyId={company.id} name={company.name} board={company.careers as CareersBoard | null} checkedAt={company.careersCheckedAt} suggested={suggested} />
          {people.length ? (
            <Card className="gap-0 py-0">
              <CardHeader className="border-b py-3">
                <CardTitle>{t("people", { name: company.name })}</CardTitle>
              </CardHeader>
              <ul className="divide-y text-sm">
                {people.map((person) => (
                  <li key={person.id} className="px-4 py-2">
                    <p className="truncate font-medium">{person.name}</p>
                    <p className="truncate text-xs text-muted-foreground">{[person.title, person.email].filter(Boolean).join(" · ") || t("noDetails")}</p>
                  </li>
                ))}
              </ul>
              <Link href="/contacts" className="border-t px-4 py-2 text-xs text-muted-foreground hover:text-foreground">{t("allContacts")}</Link>
            </Card>
          ) : null}
          <FindPeople companyId={company.id} companyName={company.name} hasWebsite={Boolean(company.website)} roleGroups={roles} {...startupProps(startupSignal(((company.profile as { facts?: { label: string; value: string }[] } | null)?.facts) ?? []))} />
        </div>
      </div>
    </div>
  )
}

function CompanyOverview({ research, name, t, locale }: { research: CompanyResearch | null; name: string; t: Awaited<ReturnType<typeof getTranslations<"company">>>; locale: string }) {
  const websiteAbout = research?.about.filter((item) => item.source !== "job posting") ?? []
  const about = websiteAbout.length ? websiteAbout : research?.about ?? []
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("overview.title")}</CardTitle>
        <CardDescription>{research ? `${research.summary ? `${t("overview.ai")} · ` : ""}${t("overview.sources", { count: research.sources.length })} · ${t("overview.updated", { date: new Date(research.generatedAt).toLocaleDateString(locale, { day: "numeric", month: "short" }) })}` : t("overview.intro", { name })}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-5">
        {!research?.summary ? (
          <div className="flex items-start gap-3 rounded-lg bg-muted/40 p-4">
            <SearchIcon aria-hidden="true" className="mt-1 size-5 shrink-0 text-muted-foreground" />
            <div className="space-y-1">
              <p className="font-medium">{research ? t("overview.generate") : t("overview.start")}</p>
              <p className="text-base leading-relaxed text-muted-foreground">{t("overview.how", { action: research ? t("overview.refresh") : t("overview.research") })}</p>
            </div>
          </div>
        ) : null}
        {research?.summary ? <p className="max-w-prose text-base leading-relaxed">{research.summary.text}</p> : about.length ? <details className="space-y-3 text-sm"><summary className="w-fit cursor-pointer font-medium">{t("overview.excerpts")}</summary>{about.slice(0, 2).map((item) => <p key={item.text} className="max-w-prose leading-relaxed text-muted-foreground">{item.text}</p>)}</details> : null}
        {research?.mission.length ? (
          <section className="space-y-2 border-t pt-4">
            <h2 className="font-medium">{t("overview.mission")}</h2>
            {research.mission.slice(0, 2).map((item) => <p key={item.text} className="max-w-prose text-base leading-relaxed text-muted-foreground">{item.text}</p>)}
          </section>
        ) : null}
        {research?.values.length ? (
          <section className="space-y-2 border-t pt-4">
            <h2 className="font-medium">{t("overview.values")}</h2>
            <ul className="flex flex-wrap gap-2">{research.values.map((item) => <li key={item.text} className="rounded-md bg-muted px-2.5 py-1 text-sm">{item.text}</li>)}</ul>
          </section>
        ) : null}
        {research?.facts.length ? (
          <dl className="grid gap-3 border-t pt-4 sm:grid-cols-2">
            {research.facts.slice(0, 6).map((fact) => <div key={fact.label}><dt className="text-sm text-muted-foreground">{fact.label}</dt><dd className="mt-1 text-base wrap-anywhere">{fact.value}</dd></div>)}
          </dl>
        ) : null}
        {research?.notes.map((note) => <p key={note} className="rounded-md bg-muted p-3 text-sm leading-relaxed text-muted-foreground">{note}</p>)}
        {research?.sources.length ? (
          <section className="space-y-2 border-t pt-4">
            <h2 className="text-sm font-medium">{t("overview.sourcesTitle")}</h2>
            <ul className="grid gap-2 text-sm">{research.sources.map((source) => <li key={source.url}><a href={source.url} target="_blank" rel="noreferrer" className="inline-flex max-w-full items-center gap-1.5 text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-2 focus-visible:outline-ring"><span className="min-w-0 truncate">{source.title || source.url}</span><ExternalLinkIcon aria-hidden="true" className="size-3.5 shrink-0" /></a></li>)}</ul>
          </section>
        ) : null}
      </CardContent>
    </Card>
  )
}

async function Facts({ company }: { company: { id: string; name: string; profile: unknown; profiledAt: Date | null } }) {
  const [enabled, profile] = await Promise.all([companyFactsEnabled(), companyProfile(company)])
  return <CompanyFacts companyId={company.id} name={company.name} profile={profile} enabled={enabled} />
}
