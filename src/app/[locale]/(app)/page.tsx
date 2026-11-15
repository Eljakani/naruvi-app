import { setupChoices } from "@/server/queries/setup"
import Link from "next/link"
import { redirect } from "next/navigation"
import { Suspense } from "react"
import { ArrowRightIcon, BriefcaseBusinessIcon, CheckIcon, ChevronRightIcon, FileTextIcon, PlusIcon, SendIcon, UserRoundCheckIcon } from "lucide-react"
import { PageHeader } from "@/components/page-header"
import { Otter, type OtterPose } from "@/components/naruvi/otter"
import { FitRing } from "@/components/applications/fit-ring"
import { EntryLogo } from "@/components/profile/entry-logo"
import { NeedsAttention } from "@/components/tracking/needs-attention"
import { DashboardCalendar } from "@/components/tracking/dashboard-calendar"
import { OutcomeFunnel } from "@/components/tracking/outcome-funnel"
import { AddJobDialog } from "@/components/jobs/add-job-dialog"
import { Badge } from "@/components/reui/badge"
import { Frame, FrameDescription, FrameHeader, FramePanel, FrameTitle } from "@/components/reui/frame"
import { IconTile } from "@/components/reui/icon-tile"
import { Button } from "@/components/ui/button"
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { LiveRefresh } from "@/components/refresh-runs"
import { ago, workflowLabel } from "@/components/runs/labels"
import { WorkflowIcon } from "@/components/runs/workflow-icon"
import { COLUMNS } from "@/lib/stages"
import { cn } from "@/lib/utils"
import { Progress } from "@/components/ui/progress"
import { Skeleton } from "@/components/ui/skeleton"
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
    <div className="grid gap-4" aria-hidden>
      <Skeleton className="h-36 rounded-xl" />
      <Skeleton className="h-32 rounded-xl" />
      <div className="grid gap-4 @min-[54rem]/workspace:grid-cols-3">
        <Skeleton className="h-96 rounded-xl @min-[54rem]/workspace:col-span-2" />
        <Skeleton className="h-96 rounded-xl" />
      </div>
    </div>
  )
}

/** The otter with a soft shadow under it, as it sits in Naruvi's note. */
function NoteOtter({ pose, height }: { pose: OtterPose; height: number }) {
  return (
    <span className="relative grid shrink-0 place-items-end">
      <span className="absolute inset-x-1 bottom-0 h-4 rounded-[50%] bg-brand/15 blur-md" aria-hidden />
      <Otter pose={pose} height={height} className="relative" priority />
    </span>
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
  // A brand-new install starts with the setup guide, until the owner chooses to skip it.
  if (!data.hasProfile && data.jobs === 0 && !(await setupChoices()).skipped) redirect("/setup")
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

  // When the note is about the list right below it, it becomes that list's heading instead of a second card.
  const attentionShown = Boolean(data.applications && (data.attention.length || data.replies.length))
  const inAttention = note?.href === "#attention"
  const ready = sum(["ready"])

  return (
    <>
      <PageHeader
        title={data.firstName ? t("greeting.named", { greeting, name: data.firstName }) : greeting}
        description={data.applications ? t("summary.sentence", { summary }) : t("description")}
        actions={<AddJobDialog trigger={<Button><PlusIcon /> {t("addJob")}</Button>} />}
      />
      {setupDone < setup.length ? (
        <Frame>
          <FrameHeader className="flex-row flex-wrap items-center gap-3">
            <div className="grid min-w-0 flex-1 basis-40">
              <FrameTitle><h2>{t("setup.title")}</h2></FrameTitle>
              <FrameDescription>{t("setup.progress", { done: setupDone, total: setup.length })}</FrameDescription>
            </div>
            <Progress value={(setupDone / setup.length) * 100} className="w-24" />
            <Button size="sm" variant="outline" nativeButton={false} render={<Link href="/setup" />}>
              {t("setup.guide")} <ArrowRightIcon />
            </Button>
          </FrameHeader>
          <FramePanel className="grid gap-4 md:grid-cols-3">
            {setup.map((step) => (
              <div key={step.label} className="flex items-start gap-3">
                <IconTile variant="soft" size="sm" className={step.done ? "text-success" : "text-muted-foreground"}>
                  {step.done ? <CheckIcon aria-hidden /> : <step.icon aria-hidden />}
                </IconTile>
                <div className="grid min-w-0 flex-1 gap-1">
                  <div className="text-sm font-medium">{step.label}</div>
                  <p className="text-sm text-pretty text-muted-foreground">{step.detail}</p>
                  {!step.done ? (
                    <Button size="sm" variant="outline" className="mt-1 w-fit" nativeButton={false} render={<Link href={step.href} />}>
                      {t("setup.start")} <ArrowRightIcon />
                    </Button>
                  ) : null}
                </div>
              </div>
            ))}
          </FramePanel>
        </Frame>
      ) : null}

      {attentionShown ? (
        <div id="attention" className="scroll-mt-4">
          <NeedsAttention
            items={data.attention}
            now={data.now}
            replies={data.replies}
            lead={note && inAttention ? (
              <>
                <NoteOtter pose={note.pose} height={52} />
                <div className="grid min-w-0 flex-1">
                  <FrameTitle className="text-base text-balance"><h2>{note.title}</h2></FrameTitle>
                  <FrameDescription className="text-pretty">{note.text}</FrameDescription>
                </div>
              </>
            ) : undefined}
          />
        </div>
      ) : null}

      {note && !(attentionShown && inAttention) ? (
        <Frame className="cb-enter" role="region" aria-label="Naruvi">
          <FramePanel className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <NoteOtter pose={note.pose} height={72} />
            <div className="grid min-w-0 flex-1 gap-0.5">
              <p className="text-xs font-medium tracking-wide text-brand uppercase">Naruvi</p>
              <p className="text-base font-semibold tracking-tight text-balance">{note.title}</p>
              <p className="text-sm text-pretty text-muted-foreground">{note.text}</p>
            </div>
            <Button variant="outline" className="shrink-0 max-sm:ms-[5.5rem]" nativeButton={false} render={<Link href={note.href} />}>
              {note.cta} <ArrowRightIcon />
            </Button>
          </FramePanel>
        </Frame>
      ) : null}

      {/* One strip for the whole pipeline: each stage opens the list behind it. */}
      {data.applications ? (
        <Frame>
          <FrameHeader className="flex-row items-center gap-3">
            <div className="grid min-w-0 flex-1">
              <FrameTitle><h2>{t("pipeline.title")}</h2></FrameTitle>
              <FrameDescription>{active ? t("pipeline.active", { count: active }) : t("pipeline.none")}</FrameDescription>
            </div>
            <Button size="sm" variant="ghost" nativeButton={false} render={<Link href="/applications" />}>{t("pipeline.board")} <ArrowRightIcon /></Button>
          </FrameHeader>
          <FramePanel className="grid gap-3">
            {active > 0 ? <div aria-hidden="true" className="flex h-2 gap-0.5 overflow-hidden rounded-full bg-muted">
              {pipeline.filter((stage) => stage.count > 0).map((stage) => (
                <span key={stage.id} className={STAGE_COLOR[stage.id]} style={{ flexGrow: stage.count, flexBasis: 0 }} />
              ))}
            </div> : null}
            <ul className="-mx-1.5 grid grid-cols-2 gap-x-1 @min-[40rem]/workspace:grid-cols-5">
              {pipeline.map((stage) => (
                <li key={stage.id}>
                  <Link href={`/applications?view=list&stage=${stage.id}`} className="grid h-full content-start gap-0.5 rounded-lg px-1.5 py-1.5 transition-colors hover:bg-muted/60 focus-visible:outline-2 focus-visible:outline-ring focus-visible:-outline-offset-2">
                    <span className="flex min-w-0 items-center gap-2 text-sm text-muted-foreground">
                      <span aria-hidden="true" className={cn("size-2 shrink-0 rounded-full ring-1 ring-foreground/20", STAGE_COLOR[stage.id])} />
                      <span className="truncate">{tl(`column.${stage.id}`)}</span>
                    </span>
                    <span className={cn("text-2xl font-semibold tabular-nums tracking-tight", !stage.count && "text-muted-foreground")}>{stage.count}</span>
                    {stage.id === "documents" && ready ? <span className="text-xs font-medium text-brand">{t("pipeline.ready", { count: ready })}</span> : null}
                  </Link>
                </li>
              ))}
            </ul>
          </FramePanel>
        </Frame>
      ) : null}

      <div className="grid gap-4 @min-[54rem]/workspace:grid-cols-3">
        <div className="grid min-w-0 content-start gap-4 @min-[54rem]/workspace:col-span-2">
        <Frame>
          <FrameHeader className="flex-row items-center gap-3">
            <div className="grid min-w-0 flex-1">
              <FrameTitle><h2>{t("recent.title")}</h2></FrameTitle>
              <FrameDescription>{t("recent.description")}</FrameDescription>
            </div>
            {data.recent.length ? (
              <Button size="sm" variant="ghost" nativeButton={false} render={<Link href="/applications" />}>
                {t("recent.viewAll")} <ArrowRightIcon />
              </Button>
            ) : null}
          </FrameHeader>
          <FramePanel className="py-1.5">
            {data.recent.length ? (
              <ul className="-mx-2.5 divide-y">
                {data.recent.map((application) => {
                  const score = displayFitScore(application.analysis as StoredAnalysis | null)
                  const stage = application.status === "rejected" ? tl("column.closed") : tl(`status.${application.status}`)
                  return (
                    <li key={application.id}>
                      <Link href={`/applications/${application.id}`} className="group/row flex min-w-0 items-center gap-3 rounded-md px-2.5 py-2.5 transition-colors hover:bg-muted/60 focus-visible:outline-2 focus-visible:outline-ring focus-visible:-outline-offset-2">
                        <EntryLogo path={application.job.company?.logoPath} name={application.job.company?.name ?? "?"} size={32} />
                        <span className="grid min-w-0 flex-1 gap-0.5">
                          <span className="truncate font-medium">{application.job.title}</span>
                          <span className="truncate text-xs text-muted-foreground">
                            {/* On a phone the stage and the time join the company line, so nothing scrolls sideways. */}
                            <span className="@min-[36rem]/workspace:hidden">{stage} · </span>
                            {application.job.company?.name}
                            <span className="@min-[36rem]/workspace:hidden"> · {relative(application.updatedAt, locale)}</span>
                          </span>
                        </span>
                        <Badge variant={application.status === "ready" ? "primary-light" : application.status === "offer" ? "success-light" : "outline"} className="hidden shrink-0 @min-[36rem]/workspace:inline-flex">{stage}</Badge>
                        <span className="hidden w-24 shrink-0 text-end text-xs text-muted-foreground @min-[36rem]/workspace:block">{relative(application.updatedAt, locale)}</span>
                        <FitRing score={score} className="w-8 text-center" />
                        <ChevronRightIcon aria-hidden className="size-4 shrink-0 text-muted-foreground transition-transform group-hover/row:translate-x-0.5 rtl:rotate-180 rtl:group-hover/row:-translate-x-0.5" />
                      </Link>
                    </li>
                  )
                })}
              </ul>
            ) : (
              <Empty>
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <SendIcon />
                  </EmptyMedia>
                  <EmptyTitle>{t("recent.emptyTitle")}</EmptyTitle>
                  <EmptyDescription>{t("recent.emptyBody")}</EmptyDescription>
                </EmptyHeader>
                <EmptyContent>
                  <AddJobDialog trigger={<Button><PlusIcon /> {t("addJob")}</Button>} />
                </EmptyContent>
              </Empty>
            )}
          </FramePanel>
        </Frame>
          {data.funnel[0].count ? <OutcomeFunnel stages={data.funnel} /> : null}
        </div>

        <div className="grid min-w-0 content-start gap-4">
          <LiveRefresh active every={busy ? 5000 : 20000} />
          <DashboardCalendar events={data.events} now={data.now} />

          <Frame spacing="sm">
            <FrameHeader className="flex-row items-center gap-3">
              <FrameTitle className="min-w-0 flex-1"><h2>{t("activity.title")}</h2></FrameTitle>
              <Button size="xs" variant="ghost" nativeButton={false} render={<Link href="/runs" />}>{t("activity.allRuns")} <ArrowRightIcon /></Button>
            </FrameHeader>
            <FramePanel className="py-1.5">
              {data.recentRuns.length ? (
                <ul className="-mx-1.5 divide-y">
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
            </FramePanel>
          </Frame>
        </div>
      </div>
    </>
  )
}
