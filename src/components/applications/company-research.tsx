"use client"

import { useRouter } from "next/navigation"
import { useEffect, useState, useTransition } from "react"
import { BuildingIcon, ExternalLinkIcon, Loader2Icon, MessageCircleQuestionIcon, PlusIcon, RefreshCwIcon, SearchIcon, SparklesIcon } from "lucide-react"
import { toast } from "sonner"
import { researchCompanyAction } from "@/app/(app)/applications/[id]/research/actions"
import { AI_STEPS, AiSteps, useStep } from "@/components/ai-progress"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { WorkingBar } from "@/components/working-bar"
import { cn } from "@/lib/utils"
import { promptsFor, type CompanyResearch as Research } from "@/server/research/brief"

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
        <a key={host} href={url} target="_blank" rel="noopener noreferrer nofollow" title={url} className="inline-flex min-w-0 items-center gap-0.5 text-[11px] text-muted-foreground hover:text-foreground">
          <span className="truncate">{host}</span> <ExternalLinkIcon className="size-2.5 shrink-0" />
        </a>
      ) : (
        <span key={host} className="text-[11px] text-muted-foreground">{host}</span>
      )))}
    </span>
  )
}

function SourceLink({ source }: { source: string }) {
  if (source === "job posting") return <span className="text-[11px] text-muted-foreground">job posting</span>
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
      if (!result.ok) return void toast.error("Research failed", { description: result.error })
      setResearch(result.data)
      const found = (result.data?.about.length ?? 0) + (result.data?.mission.length ?? 0) + (result.data?.values.length ?? 0)
      toast.success(found ? `Read ${result.data?.sources.length ?? 0} page(s) from ${company}` : "Nothing quotable found", { description: found ? "Every item links to its source." : "Add the company website on the job to improve results." })
    })

  if (!research) {
    return (
      <div className="relative grid gap-2 overflow-hidden rounded-lg border border-dashed p-3">
        <WorkingBar active={pending} />
        <p className="text-xs text-muted-foreground">
          {waiting ? `Reading ${company}’s own website in the background. This fills in by itself in a moment.` : `Read ${company}’s own website (about, mission, values) and this posting to find specific, sourced reasons to mention. Nothing is invented and nothing leaves your machine except the page requests.`}
        </p>
        {pending || waiting ? (
          <AiSteps steps={AI_STEPS.research} step={pending ? researchStep : backgroundStep} />
        ) : (
          <Button size="sm" variant="outline" className="w-fit" onClick={() => run(false)}>
            <SearchIcon /> Research {company}
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
          <MessageCircleQuestionIcon className="size-3.5" /> Questions to answer in your own words
          <button type="button" onClick={() => run(true)} disabled={pending} className="ml-auto inline-flex items-center gap-1 text-muted-foreground hover:text-foreground" aria-label="Refresh research">
            {pending ? <Loader2Icon className="size-3 animate-spin" /> : <RefreshCwIcon className="size-3" />}
          </button>
        </div>
        {research.angles?.length ? (
          <div className="grid gap-1.5">
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <SparklesIcon className="size-3" /> Specific angles from their own words
            </span>
            <ul className="grid gap-1">
              {research.angles.map((angle) => (
                <li key={angle.text} className="flex items-start gap-2 text-xs leading-5">
                  <span className="min-w-0 flex-1">
                    {angle.text} {angle.sources[0] ? <SourceLink source={angle.sources[0]} /> : null}
                  </span>
                  {onInsert ? (
                    <Button size="icon-xs" variant="ghost" aria-label="Insert into the letter" onClick={() => onInsert(angle.text)}>
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
              <Button key={starter} size="xs" variant="outline" onClick={() => onInsert(starter)} className="h-auto max-w-full py-1 text-left whitespace-normal">
                <PlusIcon /> {starter.trim()}…
              </Button>
            ))}
          </div>
        ) : null}
        {research.mission[0] || research.values.length ? (
          <div className="grid gap-1 border-t pt-2">
            {research.mission.slice(0, 1).map((item) => (
              <p key={item.text} className="text-xs">
                <span className="text-muted-foreground">Mission: </span>“{item.text}” <SourceLink source={item.source} />
              </p>
            ))}
            {research.values.length ? (
              <p className="text-xs">
                <span className="text-muted-foreground">Values: </span>
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
        <ol className="cb-stagger grid gap-2.5">
          {visibleAngles.map((angle, index) => (
            <li key={angle.text} className="flex min-w-0 gap-2.5">
              <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-medium tabular-nums">{index + 1}</span>
              <div className="grid min-w-0 gap-0.5">
                <p className={cn("text-sm leading-5", !showAll && "line-clamp-3")}>{angle.text}</p>
                <Sources sources={angle.sources} />
              </div>
            </li>
          ))}
        </ol>
      ) : null}
      {(!angles.length || showAll) && (about.length || research.mission.length) ? (
        <div className="grid gap-2">
          {research.mission.slice(0, showAll ? 2 : 1).map((item) => (
            <div key={item.text} className="grid gap-0.5 border-l-2 pl-3">
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
      {empty && !angles.length && !research.notes?.length ? <p className="text-xs text-muted-foreground">Nothing quotable found on {research.website || "the company site"}. Check the website on the job page.</p> : null}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-t pt-2 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1"><BuildingIcon className="size-3" /> {research.sources.length} page{research.sources.length === 1 ? "" : "s"} read</span>
        {angles.length > 3 || extra ? (
          <button type="button" className="hover:text-foreground" onClick={() => setShowAll(!showAll)}>
            · {showAll ? "Show less" : "Show more"}
          </button>
        ) : null}
        <button type="button" onClick={() => run(true)} disabled={pending} className="ml-auto inline-flex items-center gap-1 hover:text-foreground">
          {pending ? <Loader2Icon className="size-3 animate-spin" /> : <RefreshCwIcon className="size-3" />} Refresh
        </button>
      </div>
    </div>
  )
}
