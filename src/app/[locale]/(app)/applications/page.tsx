import Link from "next/link"
import { OtterEmpty } from "@/components/naruvi/otter"
import { Suspense } from "react"
import { connection } from "next/server"
import { ArchiveIcon, ChevronRightIcon, DownloadIcon, KanbanIcon, ListIcon, PlusIcon } from "lucide-react"
import { PageHeader } from "@/components/page-header"
import { AddJobDialog } from "@/components/jobs/add-job-dialog"
import { EntryLogo } from "@/components/profile/entry-logo"
import { FitRing } from "@/components/applications/fit-ring"
import { Board } from "@/components/tracking/board"
import { ArchiveAllButton, ArchiveButton, NextStep } from "@/components/tracking/next-step"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { CLOSED } from "@/lib/attention"
import { COLUMNS, columnOf } from "@/lib/stages"
import { cn } from "@/lib/utils"
import { ClearFilters, SearchBox, UrlSelect } from "@/components/list-toolbar"
import { APPLICATION_SORTS, listApplications, type ApplicationSort, type StoredAnalysis } from "@/server/applications/repository"
import { displayFitScore } from "@/server/analysis/match"
import { stageSince } from "@/server/tracking/service"
import { mailInbox } from "@/server/mail/classify"
import { useLocale, useTranslations } from "next-intl"
import { getTranslations } from "next-intl/server"

export async function generateMetadata() {
  return { title: (await getTranslations("nav.items"))("applications.title") }
}

export default function ApplicationsPage({ searchParams }: PageProps<"/[locale]/applications">) {
  const t = useTranslations("applications")
  return (
    <>
      <PageHeader
        title={t("title")}
        description={t("description")}
        actions={<AddJobDialog trigger={<Button><PlusIcon /> {t("addJob")}</Button>} />}
      />
      <Suspense fallback={<Skeleton className="h-80 rounded-xl" />}>
        <List searchParams={searchParams} />
      </Suspense>
    </>
  )
}

type Search = Promise<Record<string, string | string[] | undefined>>
type Show = "active" | "closed" | "archived"
const showOf = (value: unknown): Show => (value === "closed" || value === "archived" ? value : "active")

async function ViewSwitch({ searchParams }: { searchParams: Search }) {
  const t = await getTranslations("applications")
  const params = await searchParams
  const view = params.view === "list" ? "list" : "board"
  const show = showOf(params.show)
  const link = (next: { view?: string; show?: Show }) => {
    const query = new URLSearchParams()
    const v = next.view ?? view
    const s = next.show ?? show
    if (v === "list") query.set("view", "list")
    if (s !== "active") query.set("show", s)
    const text = query.toString()
    return text ? `/applications?${text}` : "/applications"
  }
  return (
    <div className="flex max-w-full flex-wrap gap-2">
      <div className="flex gap-1 rounded-lg bg-muted p-0.5" role="group" aria-label={t("which")}>
        {(["active", "closed", "archived"] as const).map((item) => (
          <Button key={item} size="sm" variant={show === item ? "secondary" : "ghost"} className={cn(show === item && "bg-background shadow-xs")} nativeButton={false} render={<Link href={link({ show: item })} />}>
            {t(`show.${item}`)}
          </Button>
        ))}
      </div>
      <Button size="sm" variant="outline" nativeButton={false} render={<a href="/api/export/applications" download />} title={t("exportHint")}>
        <DownloadIcon /> {t("export")}
      </Button>
      {show === "active" ? (
        <div className="flex gap-1">
          <Button size="sm" variant={view === "board" ? "secondary" : "ghost"} nativeButton={false} render={<Link href={link({ view: "board" })} />}>
            <KanbanIcon /> {t("board")}
          </Button>
          <Button size="sm" variant={view === "list" ? "secondary" : "ghost"} nativeButton={false} render={<Link href={link({ view: "list" })} />}>
            <ListIcon /> {t("list")}
          </Button>
        </div>
      ) : null}
    </div>
  )
}

async function List({ searchParams }: { searchParams: Search }) {
  const [t, tl] = await Promise.all([getTranslations("applications"), getTranslations("labels")])
  await connection()
  const params = await searchParams
  const show = showOf(params.show)
  const view = show === "active" && params.view !== "list" ? "board" : "list"
  const q = typeof params.q === "string" ? params.q.slice(0, 200) : undefined
  const stages = COLUMNS.filter((column) => column.id !== "closed")
  const stage = show === "active" && view === "list" ? stages.find((column) => column.id === params.stage) : undefined
  const sort = typeof params.sort === "string" && Object.hasOwn(APPLICATION_SORTS, params.sort) ? (params.sort as ApplicationSort) : undefined
  const [all, since, inbox] = await Promise.all([listApplications({ archived: show === "archived", q, sort }), stageSince(), mailInbox()])
  const applications = show === "archived" ? all : all.filter((application) =>
    (show === "closed") === CLOSED.includes(application.status) && (!stage || columnOf(application.status) === stage.id))
  const closedCount = show === "active" ? all.filter((application) => CLOSED.includes(application.status)).length : 0
  const toolbar = (
    <div className="flex flex-wrap items-center gap-2">
      <SearchBox placeholder={t("search")} />
      {show === "active" && view === "list" ? <UrlSelect name="stage" label={t("stage")} options={[{ value: "all", label: t("allStages") }, ...stages.map(({ id }) => ({ value: id, label: tl(`column.${id}`) }))]} /> : null}
      <ClearFilters names={["q", "stage"]} />
      <div className="ms-auto flex items-center gap-2">
        {q ? <span className="text-sm text-muted-foreground tabular-nums">{t("matches", { count: applications.length })}</span> : null}
        {view === "list" ? <UrlSelect name="sort" label={t("sort")} options={(Object.keys(APPLICATION_SORTS) as ApplicationSort[]).map((value) => ({ value, label: t(`sorts.${value}`) }))} className="w-44" /> : null}
      </div>
      <ViewSwitch searchParams={searchParams} />
    </div>
  )
  if (!all.length && show === "active" && !q) {
    return (
      <OtterEmpty pose="planning-next-step" title={t("empty.title")} action={<AddJobDialog trigger={<Button><PlusIcon /> {t("addJob")}</Button>} />}>
        {t("empty.body")}
      </OtterEmpty>
    )
  }
  if (view === "board") {
    return (
      <div className="grid gap-3">
        {toolbar}
        {q && !all.length ? <p className="text-sm text-muted-foreground">{t("noMatch", { query: q })}</p> : null}
        <Board
          closedHref="/applications?show=closed"
          items={all.map((application) => ({
            jobId: application.job.id,
            id: application.id,
            title: application.job.title,
            company: application.job.company?.name ?? "",
            logoPath: application.job.company?.logoPath ?? null,
            status: application.status,
            fit: displayFitScore(application.analysis as StoredAnalysis | null),
            since: (since.get(application.id) ?? application.createdAt).toISOString(),
            nextStep: application.nextStep,
            nextStepDue: application.nextStepDue?.toISOString() ?? null,
            unread: inbox.unread.get(application.id) ?? 0,
          }))}
        />
      </div>
    )
  }
  if (!applications.length) {
    return (
      <div className="grid gap-3">
        {toolbar}
        {stage ? <p className="rounded-xl border p-6 text-sm text-muted-foreground">{t("noneInStage", { stage: tl(`column.${stage.id}`) })}</p> : <EmptyState show={show} q={q} />}
      </div>
    )
  }
  return (
    <div className="grid gap-3">
      {toolbar}
      <ApplicationTable applications={applications} show={show} closedCount={closedCount} />
    </div>
  )
}

function EmptyState({ show, q }: { show: Show; q?: string }) {
  const t = useTranslations("applications")
  return (
    <Empty className="border">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <ArchiveIcon />
        </EmptyMedia>
        <EmptyTitle>{t(`emptyState.${show}.title`)}</EmptyTitle>
        <EmptyDescription>{q ? t("noMatchHere", { query: q }) : t(`emptyState.${show}.body`)}</EmptyDescription>
      </EmptyHeader>
    </Empty>
  )
}

function ApplicationTable({ applications, show, closedCount }: { applications: Awaited<ReturnType<typeof listApplications>>; show: Show; closedCount: number }) {
  const t = useTranslations("applications")
  const tl = useTranslations("labels")
  const locale = useLocale()
  return (
    <div className="grid gap-3">
      {show === "closed" ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-muted/30 px-4 py-2.5 text-sm">
          <span className="text-muted-foreground">{t("closedHint")}</span>
          <ArchiveAllButton ids={applications.map((application) => application.id)} />
        </div>
      ) : null}
      {show === "active" && closedCount ? (
        <p className="text-sm text-muted-foreground">
          {t("closedHidden", { count: closedCount })}{" "}
          <Link href="/applications?show=closed" className="underline underline-offset-2">{t("showThem")}</Link>
        </p>
      ) : null}
      <Card className="py-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="ps-4">{t("table.role")}</TableHead>
              <TableHead>{t("table.stage")}</TableHead>
              <TableHead className="hidden lg:table-cell">{t("table.nextStep")}</TableHead>
              <TableHead className="hidden md:table-cell">{t("table.evidence")}</TableHead>
              <TableHead className="text-end">{t("table.fit")}</TableHead>
              <TableHead className="hidden text-end sm:table-cell">{show === "archived" ? t("table.archived") : t("table.updated")}</TableHead>
              <TableHead className="w-10 pe-4" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {applications.map((application) => {
              const analysis = application.analysis as StoredAnalysis | null
              return (
                <TableRow key={application.id}>
                  <TableCell className="ps-4">
                    <Link href={`/applications/${application.id}`} className="flex min-w-0 items-center gap-3">
                      <EntryLogo path={application.job.company?.logoPath} name={application.job.company?.name ?? "?"} size={32} morph={`application-${application.id}`} />
                      <div className="min-w-0">
                        <div className="truncate font-medium">{application.job.title}</div>
                        <div className="truncate text-xs text-muted-foreground">{application.job.company?.name}</div>
                      </div>
                    </Link>
                  </TableCell>
                  <TableCell>
                    <Badge variant={application.status === "ready" ? "default" : "secondary"}>{tl(`status.${application.status}`)}</Badge>
                  </TableCell>
                  <TableCell className="hidden max-w-64 lg:table-cell">
                    {application.nextStep || application.nextStepDue ? <NextStep id={application.id} nextStep={application.nextStep} due={application.nextStepDue?.toISOString() ?? null} size="sm" /> : <span className="text-muted-foreground">—</span>}
                  </TableCell>
                  <TableCell className="hidden text-muted-foreground md:table-cell">{analysis ? t("evidence", { met: analysis.counts.met, gap: analysis.counts.gap }) : "—"}</TableCell>
                  <TableCell className="text-end">
                    <FitRing score={displayFitScore(analysis)} className="ms-auto" />
                  </TableCell>
                  <TableCell className="hidden text-end text-muted-foreground sm:table-cell">{(application.archivedAt ?? application.updatedAt).toLocaleDateString(locale, { day: "numeric", month: "short" })}</TableCell>
                  <TableCell className="pe-4">
                    {show === "active" ? (
                      <Button size="icon-sm" variant="ghost" aria-label={t("open")} nativeButton={false} render={<Link href={`/applications/${application.id}`} />}>
                        <ChevronRightIcon />
                      </Button>
                    ) : (
                      <ArchiveButton id={application.id} archived={show === "archived"} size="sm" />
                    )}
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </Card>
    </div>
  )
}
