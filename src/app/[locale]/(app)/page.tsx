import Link from "next/link"
import { redirect } from "next/navigation"
import { Suspense } from "react"
import { ArrowRightIcon, BriefcaseBusinessIcon, CheckCircle2Icon, ChevronRightIcon, CircleIcon, FileTextIcon, PlusIcon, SendIcon, UserRoundCheckIcon } from "lucide-react"
import { PageHeader } from "@/components/page-header"
import { Otter, type OtterPose } from "@/components/naruvi/otter"
import { FitRing } from "@/components/applications/fit-ring"
import { EntryLogo } from "@/components/profile/entry-logo"
import { NeedsAttention } from "@/components/tracking/needs-attention"
import { DashboardCalendar } from "@/components/tracking/dashboard-calendar"
import { OutcomeFunnel } from "@/components/tracking/outcome-funnel"
import { AddJobDialog } from "@/components/jobs/add-job-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { LiveRefresh } from "@/components/refresh-runs"
import { ago, workflowLabel } from "@/components/runs/labels"
import { WorkflowIcon } from "@/components/runs/workflow-icon"
import { COLUMNS } from "@/lib/stages"
import { cn } from "@/lib/utils"
import { Progress } from "@/components/ui/progress"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import type { StoredAnalysis } from "@/server/applications/repository"
import { displayFitScore } from "@/server/analysis/match"
import { getDashboard } from "@/server/queries/dashboard"
import { useTranslations } from "next-intl"
import { getLocale, getTranslations } from "next-intl/server"

export async function generateMetadata() {
  return { title: (await getTranslations("nav.items"))("dashboard.title") }
}

const PIPELINE = COLUMNS.filter((column) => column.id !== "closed")
const STAGE_COLOR = {
  preparing: "bg-chart-1",
  documents: "bg-chart-2",
  sent: "bg-chart-3",
  interviewing: "bg-chart-4",
  offer: "bg-chart-5",
}
export default function DashboardPage() {
  const t = useTranslations("dashboard")
  return (
    <>
      <Suspense fallback={<><PageHeader title={t("title")} description={t("description")} /><DashboardSkeleton /></>}>
        <DashboardData />
      </Suspense>
    </>
  )
}

function DashboardSkeleton() {
  return (
    <div className="grid gap-4">
      <div className="grid gap-4 @min-[32rem]/workspace:grid-cols-2 @min-[64rem]/workspace:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-28 rounded-xl" />
        ))}
      </div>
      <div className="grid gap-4 @min-[54rem]/workspace:grid-cols-3">
        <Skeleton className="h-72 rounded-xl @min-[54rem]/workspace:col-span-2" />
        <Skeleton className="h-72 rounded-xl" />
      </div>
    </div>
  )
}

function relative(date: Date, locale: string) {
  const minutes = Math.round((Date.now() - date.getTime()) / 60_000)
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" })
  if (minutes < 60) return rtf.format(-minutes, "minute")
  if (minutes < 60 * 24) return rtf.format(-Math.round(minutes / 60), "hour")
  return rtf.format(-Math.round(minutes / 1440), "day")
}

async function DashboardData() {
  const data = await getDashboard()
  const [t, tl, locale] = await Promise.all([getTranslations("dashboard"), getTranslations("labels"), getLocale()])
  // A brand-new install starts with the setup guide.
  if (!data.hasProfile && data.jobs === 0) redirect("/setup")
  const sum = (keys: readonly string[]) => keys.reduce((total, key) => total + (data.statusCounts[key] ?? 0), 0)
  const pipeline = PIPELINE.map((stage) => ({ ...stage, count: sum(stage.statuses) }))
  const active = pipeline.reduce((total, stage) => total + stage.count, 0)
  const busy = data.recentRuns.some((run) => run.status === "running" || run.status === "queued")

  const setup = [
    { done: data.hasProfile && data.verifiedFacts > 0, label: t("setup.profile.label"), detail: t("setup.profile.detail"), href: "/profile", icon: UserRoundCheckIcon },
    { done: data.jobs > 0, label: t("setup.job.label"), detail: t("setup.job.detail"), href: "/jobs?add=1", icon: BriefcaseBusinessIcon },
    { done: data.applications > 0, label: t("setup.fit.label"), detail: t("setup.fit.detail"), href: "/applications", icon: FileTextIcon },
  ]
  const setupDone = setup.filter((step) => step.done).length

  const hour = new Date(data.now).getHours()
  const greeting = t(hour < 5 ? "greeting.late" : hour < 12 ? "greeting.morning" : hour < 18 ? "greeting.afternoon" : "greeting.evening")
  const due = data.attention.length
  const upcoming = data.events.filter((event) => new Date(event.due).getTime() >= data.now).length
  const summary = [
    due ? t("summary.due", { count: due }) : t("summary.nothing"),
    upcoming ? t("summary.upcoming", { count: upcoming }) : "",
  ].filter(Boolean).join(" · ")

  // What Naruvi would say first, most important situation wins.
  const offers = sum(["offer"])
  const interviews = sum(["interviewing"])
  const unchecked = sum(["draft", "parsed"])
  const note: { pose: OtterPose; title: string; text: string; href: string; cta: string } | null = !data.applications
    ? null
    : offers
      ? { pose: "celebrating-progress", title: t("note.offers.title", { count: offers }), text: t("note.offers.text", { count: offers }), href: "/applications?view=list&stage=offer", cta: t("note.offers.cta", { count: offers }) }
      : data.replies.length
        ? { pose: "good-news-mail", title: t("note.replies.title", { count: data.replies.length }), text: t("note.replies.text", { count: data.replies.length }), href: "#attention", cta: t("note.replies.cta", { count: data.replies.length }) }
      : due
        ? { pose: "planning-next-step", title: t("summary.due", { count: due }), text: t("note.due.text"), href: "#attention", cta: t("note.due.cta") }
        : interviews
          ? { pose: "interview-practice", title: t("note.interviews.title", { count: interviews }), text: t("note.interviews.text"), href: "/applications?view=list&stage=interviewing", cta: t("note.interviews.cta") }
          : unchecked
            ? { pose: "finding-opportunity", title: t("note.unchecked.title", { count: unchecked }), text: t("note.unchecked.text"), href: "/applications", cta: t("note.unchecked.cta") }
            : { pose: "planning-next-step", title: t("note.caughtUp.title"), text: t("note.caughtUp.text"), href: "/jobs?add=1", cta: t("addJob") }

  return (
    <>
      <PageHeader
        title={data.firstName ? t("greeting.named", { greeting, name: data.firstName }) : greeting}
        description={data.applications ? t("summary.sentence", { summary }) : t("description")}
        actions={<AddJobDialog trigger={<Button><PlusIcon /> {t("addJob")}</Button>} />}
      />
      {setupDone < setup.length ? (
        <Card>
          <CardHeader>
            <CardTitle>{t("setup.title")}</CardTitle>
            <CardDescription>
              {t("setup.progress", { done: setupDone, total: setup.length })}
            </CardDescription>
            <CardAction className="flex items-center gap-3">
              <Progress value={(setupDone / setup.length) * 100} className="w-24" />
              <Button size="sm" variant="outline" nativeButton={false} render={<Link href="/setup" />}>
                {t("setup.guide")} <ArrowRightIcon />
              </Button>
            </CardAction>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-3">
            {setup.map((step) => (
              <div key={step.label} className="flex items-start gap-3 rounded-lg border p-4">
                {step.done ? <CheckCircle2Icon className="mt-0.5 size-4 shrink-0 text-primary" /> : <CircleIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />}
                <div className="grid flex-1 gap-1">
                  <div className="text-sm font-medium">{step.label}</div>
                  <p className="text-sm text-muted-foreground">{step.detail}</p>
                  {!step.done ? (
                    <Button size="sm" variant="outline" className="mt-2 w-fit" nativeButton={false} render={<Link href={step.href} />}>
                      {t("setup.start")} <ArrowRightIcon />
                    </Button>
                  ) : null}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      {note ? (
        <section aria-label="Naruvi" className="cb-enter flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-brand/20 bg-gradient-to-r from-brand-soft via-brand-soft/40 to-card px-4 py-3">
          <span className="relative grid shrink-0 place-items-end">
            <span className="absolute inset-x-1 bottom-0 h-4 rounded-[50%] bg-brand/15 blur-md" aria-hidden />
            <Otter pose={note.pose} height={72} className="relative" priority />
          </span>
          <div className="grid min-w-0 flex-1 gap-0.5">
            <p className="text-xs font-medium tracking-wide text-brand uppercase">Naruvi</p>
            <p className="text-base font-semibold tracking-tight text-balance">{note.title}</p>
            <p className="text-sm text-pretty text-muted-foreground">{note.text}</p>
          </div>
          <Button variant="outline" className="shrink-0 border-brand/30 bg-background/80 hover:bg-background max-sm:ms-[5.5rem]" nativeButton={false} render={<Link href={note.href} />}>
            {note.cta} <ArrowRightIcon />
          </Button>
        </section>
      ) : null}

      {data.applications && (data.attention.length || data.replies.length) ? <div id="attention" className="scroll-mt-4"><NeedsAttention items={data.attention} now={data.now} replies={data.replies} /></div> : null}

      {/* One strip, four numbers: each opens the list behind it. */}
      <Card className="grid grid-cols-2 gap-0 overflow-hidden py-0 @min-[48rem]/workspace:grid-cols-4">
        <Stat title={t("stats.active.title")} value={active} hint={t("stats.active.hint")} href="/applications" />
        <Stat title={t("stats.ready.title")} value={sum(["ready"])} hint={t("stats.ready.hint")} href="/applications?view=list&stage=documents" />
        <Stat title={t("stats.sent.title")} value={sum(["submitted", "interviewing", "offer"])} hint={t("stats.sent.hint", { count: sum(["interviewing", "offer"]) })} href="/applications?view=list&stage=sent" />
        <Stat title={t("stats.facts.title")} value={data.verifiedFacts} hint={t("stats.facts.hint")} href="/profile" />
      </Card>

      <div className="grid gap-4 @min-[54rem]/workspace:grid-cols-3">
        <div className="grid min-w-0 content-start gap-4 @min-[54rem]/workspace:col-span-2">
        <Card>
          <CardHeader>
            <CardTitle>{t("recent.title")}</CardTitle>
            <CardDescription>{t("recent.description")}</CardDescription>
            <CardAction>
              <Button size="sm" variant="ghost" nativeButton={false} render={<Link href="/applications" />}>
                {t("recent.viewAll")} <ArrowRightIcon />
              </Button>
            </CardAction>
          </CardHeader>
          <CardContent>
            {data.recent.length ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("recent.role")}</TableHead>
                    <TableHead>{t("recent.stage")}</TableHead>
                    <TableHead className="text-end">{t("recent.fit")}</TableHead>
                    <TableHead className="hidden text-end sm:table-cell">{t("recent.updated")}</TableHead>
                    <TableHead className="w-8" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.recent.map((application) => {
                    const score = displayFitScore(application.analysis as StoredAnalysis | null)
                    return (
                      <TableRow key={application.id}>
                        <TableCell>
                          <Link href={`/applications/${application.id}`} className="flex min-w-0 items-center gap-3">
                            <EntryLogo path={application.job.company?.logoPath} name={application.job.company?.name ?? "?"} size={32} />
                            <div className="min-w-0">
                              <div className="truncate font-medium">{application.job.title}</div>
                              <div className="truncate text-xs text-muted-foreground">{application.job.company?.name}</div>
                            </div>
                          </Link>
                        </TableCell>
                        <TableCell>
                          <Badge variant={application.status === "ready" ? "default" : "secondary"}>{application.status === "rejected" ? tl("column.closed") : tl(`status.${application.status}`)}</Badge>
                        </TableCell>
                        <TableCell className="text-end">
                          <FitRing score={score} className="ms-auto" />
                        </TableCell>
                        <TableCell className="hidden text-end text-muted-foreground sm:table-cell">{relative(application.updatedAt, locale)}</TableCell>
                        <TableCell>
                          <Button size="icon-sm" variant="ghost" aria-label={t("open")} nativeButton={false} render={<Link href={`/applications/${application.id}`} />}>
                            <ChevronRightIcon />
                          </Button>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            ) : (
              <Empty className="border">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <SendIcon />
                  </EmptyMedia>
                  <EmptyTitle>{t("recent.emptyTitle")}</EmptyTitle>
                  <EmptyDescription>{t("recent.emptyBody")}</EmptyDescription>
                </EmptyHeader>
                <EmptyContent>
                  <Button nativeButton={false} render={<Link href="/jobs" />}>
                    <PlusIcon /> {t("addJob")}
                  </Button>
                </EmptyContent>
              </Empty>
            )}
          </CardContent>
        </Card>
          <Card size="sm">
            <CardHeader>
              <CardTitle><h2>{t("pipeline.title")}</h2></CardTitle>
              <CardDescription>{active ? t("pipeline.active", { count: active }) : t("pipeline.none")}</CardDescription>
              <CardAction>
                <Button size="sm" variant="ghost" nativeButton={false} render={<Link href="/applications" />}>{t("pipeline.board")} <ArrowRightIcon /></Button>
              </CardAction>
            </CardHeader>
            <CardContent className="grid gap-2">
              {active > 0 ? <div aria-hidden="true" className="flex h-2 gap-0.5 overflow-hidden rounded-full bg-muted">
                {pipeline.filter((stage) => stage.count > 0).map((stage) => (
                  <span key={stage.id} className={STAGE_COLOR[stage.id]} style={{ flexGrow: stage.count, flexBasis: 0 }} />
                ))}
              </div> : null}
              <ul className="grid grid-cols-2 gap-x-2 @min-[40rem]/workspace:grid-cols-5">
                {pipeline.map((stage) => (
                  <li key={stage.id}>
                    <Link href={`/applications?view=list&stage=${stage.id}`} className="flex min-h-8 items-center gap-2 rounded-md px-1.5 text-sm hover:bg-muted/60 focus-visible:outline-2 focus-visible:outline-ring focus-visible:-outline-offset-2">
                      <span aria-hidden="true" className={cn("size-2 shrink-0 rounded-full ring-1 ring-foreground/20", STAGE_COLOR[stage.id])} />
                      <span className="min-w-0 flex-1">{tl(`column.${stage.id}`)}</span>
                      <span className="font-medium tabular-nums">{stage.count}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
          {data.funnel[0].count ? <OutcomeFunnel stages={data.funnel} /> : null}
        </div>

        <div className="grid min-w-0 content-start gap-4">
          <LiveRefresh active every={busy ? 5000 : 20000} />
          <DashboardCalendar events={data.events} now={data.now} />

          <Card size="sm">
            <CardHeader>
              <CardTitle><h2>{t("activity.title")}</h2></CardTitle>
              <CardAction><Button size="xs" variant="ghost" nativeButton={false} render={<Link href="/runs" />}>{t("activity.allRuns")} <ArrowRightIcon /></Button></CardAction>
            </CardHeader>
            <CardContent>
              {data.recentRuns.length ? (
                <ul className="divide-y">
                  {data.recentRuns.slice(0, 3).map((run) => (
                    <li key={run.id}>
                      <Link href={`/runs/${run.id}`} className="flex min-w-0 items-center gap-2 rounded-md px-1.5 py-1.5 hover:bg-muted/60 focus-visible:outline-2 focus-visible:outline-ring focus-visible:-outline-offset-2">
                        <WorkflowIcon workflow={run.workflow} className="size-7" />
                        <span className="grid min-w-0 flex-1 gap-0.5">
                          <span className="break-words text-sm font-medium">{workflowLabel(run.workflow, (key) => tl(`workflow.${key}`))}</span>
                          {run.title ? <span className="truncate text-xs text-muted-foreground" title={run.title}>{run.title}</span> : null}
                        </span>
                          <span className="grid shrink-0 justify-items-end text-xs text-muted-foreground">
                            <span className={cn(run.status === "failed" && "font-medium text-destructive", run.status === "running" && "font-medium text-foreground")}>{tl(`runStatus.${run.status}`)}</span>
                            <time dateTime={run.createdAt.toISOString()}>{ago(run.createdAt, data.now, locale)}</time>
                          </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="py-2 text-sm text-muted-foreground">{t("activity.empty")}</p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  )
}

function Stat({ title, value, hint, href }: { title: string; value: number; hint: string; href: string }) {
  return (
    <Link href={href} className="group/stat grid gap-0.5 border-b border-e p-4 transition-colors hover:bg-muted/40 focus-visible:bg-muted/40 focus-visible:outline-none @min-[48rem]/workspace:border-b-0 [&:nth-child(2n)]:border-e-0 @min-[48rem]/workspace:[&:nth-child(2n)]:border-e @min-[48rem]/workspace:last:border-e-0">
      <span className="flex items-center justify-between text-sm text-muted-foreground">
        {title}
        <ArrowRightIcon className="size-3.5 opacity-0 transition-[opacity,translate] group-hover/stat:translate-x-0.5 group-hover/stat:opacity-100 rtl:group-hover/stat:-translate-x-0.5" aria-hidden />
      </span>
      <span className="text-3xl font-semibold tabular-nums tracking-tight">{value}</span>
      <span className="text-xs text-muted-foreground">{hint}</span>
    </Link>
  )
}
