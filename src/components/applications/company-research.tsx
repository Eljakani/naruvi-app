"use client"

import { useState, useTransition } from "react"
import { BuildingIcon, ExternalLinkIcon, Loader2Icon, MessageCircleQuestionIcon, PlusIcon, RefreshCwIcon, SearchIcon } from "lucide-react"
import { toast } from "sonner"
import { researchCompanyAction } from "@/app/(app)/applications/[id]/research/actions"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { WorkingBar } from "@/components/working-bar"
import { cn } from "@/lib/utils"
import { promptsFor, type CompanyResearch as Research } from "@/server/research/brief"

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
}: {
  applicationId: string
  jobId: string
  company: string
  language: string
  initial: Research | null
  mode?: "card" | "helper"
  onInsert?: (text: string) => void
}) {
  const [research, setResearch] = useState<Research | null>(initial)
  const [pending, startTransition] = useTransition()
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
          Read {company}’s own website (about, mission, values) and this posting to find specific, sourced reasons to mention. Nothing is invented and nothing leaves your machine except the page requests.
        </p>
        <Button size="sm" variant="outline" className="w-fit" onClick={() => run(false)} disabled={pending}>
          {pending ? <Loader2Icon className="animate-spin" /> : <SearchIcon />} {pending ? `Reading ${company}…` : `Research ${company}`}
        </Button>
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

  return (
    <div className={cn("grid gap-3 transition-opacity duration-200", pending && "opacity-60")} aria-busy={pending}>
      {research.notes?.map((note) => (
        <p key={note} className="rounded-md bg-amber-50 px-2.5 py-2 text-xs text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
          {note}
        </p>
      ))}
      {empty && !research.notes?.length ? <p className="text-xs text-muted-foreground">No quotable information found on {research.website || "the company site"}. Check the website on the job page.</p> : null}
      {research.about.slice(0, showAll ? 3 : 1).map((item) => (
        <div key={item.text} className="grid gap-0.5">
          <p className="text-sm leading-6">{item.text}</p>
          <SourceLink source={item.source} />
        </div>
      ))}
      {research.mission.slice(0, showAll ? 3 : 1).map((item) => (
        <div key={item.text} className="grid gap-0.5 rounded-md border-l-2 border-foreground/20 pl-3">
          <p className="text-sm leading-6 italic">“{item.text}”</p>
          <SourceLink source={item.source} />
        </div>
      ))}
      {research.values.length ? (
        <div className="grid gap-1.5">
          <span className="text-xs font-medium text-muted-foreground">Values they state</span>
          <div className="flex flex-wrap gap-1">
            {research.values.map((value) => (
              <Badge key={value.text} variant="secondary" className="font-normal">
                {value.text}
              </Badge>
            ))}
          </div>
        </div>
      ) : null}
      {research.facts.length ? (
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
          {research.facts.map((fact) => (
            <div key={fact.label} className="contents">
              <dt className="text-muted-foreground">{fact.label}</dt>
              <dd className="min-w-0 [overflow-wrap:anywhere]">{fact.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      <div className="flex items-center gap-2 border-t pt-2 text-[11px] text-muted-foreground">
        <BuildingIcon className="size-3" /> {research.sources.length} page{research.sources.length === 1 ? "" : "s"} read · {new Date(research.generatedAt).toLocaleDateString()}
        {research.about.length > 1 || research.mission.length > 1 ? (
          <button type="button" className="hover:text-foreground" onClick={() => setShowAll(!showAll)}>
            · {showAll ? "less" : "more"}
          </button>
        ) : null}
        <button type="button" onClick={() => run(true)} disabled={pending} className="ml-auto inline-flex items-center gap-1 hover:text-foreground">
          {pending ? <Loader2Icon className="size-3 animate-spin" /> : <RefreshCwIcon className="size-3" />} Refresh
        </button>
      </div>
    </div>
  )
}
