"use client"

import { useRouter } from "next/navigation"
import { useEffect, useState, useTransition } from "react"
import { BuildingIcon, CheckIcon, CopyIcon, ExternalLinkIcon, Loader2Icon, MessageCircleQuestionIcon, PlusIcon, RefreshCwIcon, SearchIcon, SparklesIcon } from "lucide-react"
import { toast } from "sonner"
import { researchCompanyAction } from "@/app/[locale]/(app)/applications/[id]/research/actions"
import { AI_STEPS, AiSteps, useStep } from "@/components/ai-progress"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { WorkingBar } from "@/components/working-bar"
import { cn } from "@/lib/utils"
import { promptsFor, type CompanyResearch as Research } from "@/server/research/brief"
import { useTranslations } from "next-intl"

/** Source links collapsed to their sites: "sekoia.com" once, not every page. */
function Sources({ sources }: { sources: string[] }) {
  const byHost = new Map<string, string>()
  for (const source of sources) {
    let host = source
    try {
      host = new URL(source).hostname.replace(/^www\./, "")
    } catch {
      // "job posting"
    }
    if (!byHost.has(host)) byHost.set(host, source)
  }
  return (
    <span className="flex min-w-0 flex-wrap gap-x-2">
      {[...byHost].map(([host, url]) => (url.startsWith("http") ? (
        <a key={host} href={url} target="_blank" rel="noopener noreferrer nofollow" title={url} className="inline-flex min-w-0 items-center gap-1 text-[11px] text-muted-foreground underline-offset-2 transition-colors hover:text-foreground hover:underline">
          <span className="truncate">{host}</span> <ExternalLinkIcon className="size-2.5 shrink-0" />
        </a>
      ) : (
        <span key={host} className="text-[11px] text-muted-foreground">{host}</span>
      )))}
    </span>
  )
}

function SourceLink({ source }: { source: string }) {
  const t = useTranslations("companyResearch")
  if (source === "job posting") return <span className="text-[11px] text-muted-foreground">{t("posting")}</span>
  let label = source
  try {
    const url = new URL(source)
    label = `${url.hostname.replace(/^www\./, "")}${url.pathname === "/" ? "" : url.pathname}`
  } catch {
    // keep raw
  }
  return (
    <a href={source} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex max-w-full items-center gap-0.5 truncate text-[11px] text-muted-foreground hover:text-foreground">
      {label} <ExternalLinkIcon className="size-2.5 shrink-0" />
    </a>
  )
}

/** One thing to mention: tap to read it whole, copy it into your notes or letter. */
function TalkingPoint({ index, text, sources }: { index: number; text: string; sources: string[] }) {
  const t = useTranslations("companyResearch")
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  return (
    <li className="group grid min-w-0 grid-cols-[1rem_minmax(0,1fr)] gap-x-2 py-2.5 first:pt-0 last:pb-0">
      <span className="text-xs leading-5 font-medium text-muted-foreground tabular-nums">{index + 1}</span>
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} title={open ? undefined : t("readAll")} className={cn("min-w-0 text-start text-sm leading-5 transition-colors hover:text-foreground", !open && "line-clamp-2")}>
        {text}
      </button>
      <div className="col-start-2 mt-1 flex min-w-0 items-center gap-2">
        <Sources sources={sources} />
        <button
          type="button"
          aria-label={t("copy")}
          onClick={() => {
            void navigator.clipboard.writeText(text)
            setCopied(true)
            setTimeout(() => setCopied(false), 1400)
          }}
          className="ms-auto inline-flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-[opacity,color] group-hover:opacity-100 hover:text-foreground focus-visible:opacity-100 [@media(hover:none)]:opacity-100"
        >
          {copied ? <CheckIcon className="size-3.5 text-emerald-600" /> : <CopyIcon className="size-3.5" />}
        </button>
      </div>
    </li>
  )
}

/**
 * Sourced company brief. "card" for the analysis page; "helper" next to the
 * cover letter's "why this company" with prompts and sentence starters.
 */
export function CompanyResearch({
  applicationId,
  jobId,
  company,
  language,
  initial,
  mode = "card",
  onInsert,
  researching = false,
}: {
  applicationId: string
  jobId: string
  company: string
  language: string
  initial: Research | null
  mode?: "card" | "helper"
  onInsert?: (text: string) => void
  /** Research was started automatically in the background. */
  researching?: boolean
}) {
  const t = useTranslations("companyResearch")
  const [research, setResearch] = useState<Research | null>(initial)
  const router = useRouter()
  const [waiting, setWaiting] = useState(researching && !initial)
  const backgroundStep = useStep(waiting, AI_STEPS.research.length)
  // Background research: refresh until it lands (or give up after ~90 s and offer the button).
  useEffect(() => {
    if (!waiting) return
    let tries = 0
    const timer = setInterval(() => {
      tries += 1
      if (tries > 22) {
        setWaiting(false)
        return
      }
      router.refresh()
    }, 4000)
    return () => clearInterval(timer)
  }, [waiting, router])
  const [lastInitial, setLastInitial] = useState(initial)
  if (initial !== lastInitial) {
    setLastInitial(initial)
    if (initial) {
      setResearch(initial)
      setWaiting(false)
    }
  }
  const [pending, startTransition] = useTransition()
  const researchStep = useStep(pending, AI_STEPS.research.length)
  const [showAll, setShowAll] = useState(false)

  const run = (force: boolean) =>
    startTransition(async () => {
      const result = await researchCompanyAction(applicationId, jobId, force, language)
      if (!result.ok) return void toast.error(t("failed"), { description: result.error })
      setResearch(result.data)
      const found = (result.data?.about.length ?? 0) + (result.data?.mission.length ?? 0) + (result.data?.values.length ?? 0)
      toast.success(found ? t("read", { count: result.data?.sources.length ?? 0, company }) : t("nothing"), { description: found ? t("linked") : t("addWebsite") })
    })

  if (!research) {
    return (
      <div className="relative grid gap-2 overflow-hidden rounded-lg border border-dashed p-3">
        <WorkingBar active={pending} />
        <p className="text-xs text-muted-foreground">
          {waiting ? t("waiting", { company }) : t("intro", { company })}
        </p>
        {pending || waiting ? (
          <AiSteps steps={AI_STEPS.research} step={pending ? researchStep : backgroundStep} />
        ) : (
          <Button size="sm" variant="outline" className="w-fit" onClick={() => run(false)}>
            <SearchIcon /> {t("research", { company })}
          </Button>
        )}
      </div>
    )
  }

  const empty = !research.about.length && !research.mission.length && !research.values.length && !research.facts.length

  if (mode === "helper") {
    const { prompts, starters } = promptsFor(research, language)
    return (
      <div className="grid gap-3 rounded-lg border bg-muted/30 p-3">
        <div className="flex items-center gap-2 text-xs font-medium">
          <MessageCircleQuestionIcon className="size-3.5" /> {t("questions")}
          <button type="button" onClick={() => run(true)} disabled={pending} className="ms-auto inline-flex items-center gap-1 text-muted-foreground hover:text-foreground" aria-label={t("refreshLabel")}>
            {pending ? <Loader2Icon className="size-3 animate-spin" /> : <RefreshCwIcon className="size-3" />}
          </button>
        </div>
        {research.angles?.length ? (
          <div className="grid gap-1.5">
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <SparklesIcon className="size-3" /> {t("angles")}
            </span>
            <ul className="grid gap-1">
              {research.angles.map((angle) => (
                <li key={angle.text} className="flex items-start gap-2 text-xs leading-5">
                  <span className="min-w-0 flex-1">
                    {angle.text} {angle.sources[0] ? <SourceLink source={angle.sources[0]} /> : null}
                  </span>
                  {onInsert ? (
                    <Button size="icon-xs" variant="ghost" aria-label={t("insert")} onClick={() => onInsert(angle.text)}>
                      <PlusIcon />
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        <ul className="grid gap-1.5">
          {prompts.map((prompt) => (
            <li key={prompt} className="text-xs leading-5 text-muted-foreground">
              • {prompt}
            </li>
          ))}
        </ul>
        {onInsert ? (
          <div className="flex flex-wrap gap-1.5">
            {starters.map((starter) => (
              <Button key={starter} size="xs" variant="outline" onClick={() => onInsert(starter)} className="h-auto max-w-full py-1 text-start whitespace-normal">
                <PlusIcon /> {starter.trim()}…
              </Button>
            ))}
          </div>
        ) : null}
        {research.mission[0] || research.values.length ? (
          <div className="grid gap-1 border-t pt-2">
            {research.mission.slice(0, 1).map((item) => (
              <p key={item.text} className="text-xs">
                <span className="text-muted-foreground">{t("mission")} </span>“{item.text}” <SourceLink source={item.source} />
              </p>
            ))}
            {research.values.length ? (
              <p className="text-xs">
                <span className="text-muted-foreground">{t("values")} </span>
                {research.values.slice(0, 5).map((v) => v.text).join(" · ")} <SourceLink source={research.values[0].source} />
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
    )
  }

  // Angles first (short, cited); everything else one click away. Posting text isn't repeated here.
  const angles = research.angles ?? []
  const about = research.about.filter((item) => item.source !== "job posting")
  const extra = about.length + research.mission.length + research.values.length + research.facts.length
  const visibleAngles = showAll ? angles : angles.slice(0, 3)
  return (
    <div className={cn("grid min-w-0 gap-3 [overflow-wrap:anywhere] transition-opacity duration-200", pending && "opacity-60")} aria-busy={pending}>
      {pending ? <AiSteps steps={AI_STEPS.research} step={researchStep} className="opacity-100" /> : null}
      {research.notes?.map((note) => (
        <p key={note} className="rounded-md bg-muted px-2.5 py-2 text-xs text-muted-foreground">
          {note}
        </p>
      ))}
      {angles.length ? (
        <ol className="cb-stagger grid divide-y">
          {visibleAngles.map((angle, index) => (
            <TalkingPoint key={angle.text} index={index} text={angle.text} sources={angle.sources} />
          ))}
        </ol>
      ) : null}
      {(!angles.length || showAll) && (about.length || research.mission.length) ? (
        <div className="grid gap-2">
          {research.mission.slice(0, showAll ? 2 : 1).map((item) => (
            <div key={item.text} className="grid gap-0.5 border-s-2 ps-3">
              <p className="text-sm leading-5 italic">“{item.text}”</p>
              <Sources sources={[item.source]} />
            </div>
          ))}
          {about.slice(0, showAll ? 2 : 1).map((item) => (
            <div key={item.text} className="grid gap-0.5">
              <p className={cn("text-sm leading-5 text-muted-foreground", !showAll && "line-clamp-3")}>{item.text}</p>
              <Sources sources={[item.source]} />
            </div>
          ))}
        </div>
      ) : null}
      {showAll && research.values.length ? (
        <div className="flex flex-wrap gap-1">
          {research.values.map((value) => (
            <Badge key={value.text} variant="secondary" className="font-normal">
              {value.text}
            </Badge>
          ))}
        </div>
      ) : null}
      {showAll && research.facts.length ? (
        <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-xs">
          {research.facts.map((fact) => (
            <div key={fact.label} className="contents">
              <dt className="text-muted-foreground">{fact.label}</dt>
              <dd className="min-w-0">{fact.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      {empty && !angles.length && !research.notes?.length ? <p className="text-xs text-muted-foreground">{t("nothingOn", { site: research.website || t("theSite") })}</p> : null}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1"><BuildingIcon className="size-3" /> {t("pagesRead", { count: research.sources.length })}</span>
        {angles.length > 3 || extra ? (
          <button type="button" className="font-medium text-foreground/80 hover:text-foreground" onClick={() => setShowAll(!showAll)}>
            {showAll ? t("less") : angles.length > 3 ? t("more", { count: angles.length - 3 }) : t("missionValues")}
          </button>
        ) : null}
        <button type="button" onClick={() => run(true)} disabled={pending} className="ms-auto inline-flex items-center gap-1 hover:text-foreground">
          {pending ? <Loader2Icon className="size-3 animate-spin" /> : <RefreshCwIcon className="size-3" />} {t("refresh")}
        </button>
      </div>
    </div>
  )
}
