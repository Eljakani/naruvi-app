"use client"

import Link from "next/link"
import { useEffect, useOptimistic, useState, useTransition } from "react"
import { ChevronDownIcon, ExternalLinkIcon, InboxIcon, PanelRightOpenIcon, PlusIcon, SearchIcon, XIcon } from "lucide-react"
import { dismissLeadAction, leadDetailsAction } from "@/app/[locale]/(app)/jobs/actions"
import { Badge as ReBadge } from "@/components/reui/badge"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card"
import { Skeleton } from "@/components/ui/skeleton"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { JobDescription } from "@/components/jobs/job-description"
import { EntryLogo } from "@/components/profile/entry-logo"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { discoveredKeywords } from "@/lib/discover"
import { cn } from "@/lib/utils"
import { useLocale, useTranslations } from "next-intl"

type Lead = { id: string; url: string; title: string; board: string; source: string; foundAt: Date; logoPath?: string | null; company?: string; location?: string; matches?: string[]; facts?: string[]; excerpt?: string }

const BOARD: Record<string, string> = { ashby: "Ashby", linkedin: "LinkedIn", indeed: "Indeed", welcometothejungle: "Welcome to the Jungle", glassdoor: "Glassdoor", greenhouse: "Greenhouse", lever: "Lever", ashbyhq: "Ashby", smartrecruiters: "SmartRecruiters", myworkdayjobs: "Workday", workable: "Workable", teamtailor: "Teamtailor", recruitee: "Recruitee" }

/** Rows a group shows before "Show all": a discovery run adds up to 30, and the saved jobs below must stay in reach. */
const SHORT = 5

/**
 * The role and the employer. A lead that names its company says so; older
 * ones wrote "Senior DevOps Engineer · Sopra Steria" in the title. The site
 * hosting a posting (Greenhouse, Lever…) is never the employer.
 */
function split(lead: Lead) {
  const title = lead.title || lead.url.replace(/^https?:\/\/(www\.)?/, "")
  if (lead.company) return { role: title.endsWith(` · ${lead.company}`) ? title.slice(0, -(lead.company.length + 3)) : title, company: lead.company }
  const at = title.lastIndexOf(" · ")
  return at > 0 ? { role: title.slice(0, at), company: title.slice(at + 3) } : { role: title, company: "" }
}

/**
 * Postings found in job-alert emails, by a discovery search or saved with the
 * browser extension, grouped by where they came from. Import reads the posting
 * like any link; nothing is saved until you check it.
 */
export function JobLeads({ leads }: { leads: Lead[] }) {
  const t = useTranslations("jobs.leads")
  const [visible, hide] = useOptimistic(leads, (state, ids: string[]) => state.filter((lead) => !ids.includes(lead.id)))
  const [, startTransition] = useTransition()
  if (!visible.length) return null
  const dismiss = (ids: string[]) =>
    startTransition(async () => {
      hide(ids)
      await Promise.all(ids.map((id) => dismissLeadAction(id)))
    })
  const groups = [...Map.groupBy(visible, (lead) => lead.source)]
  return (
    <Card className="gap-4">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm">
          <InboxIcon className="size-4" /> {t("title")}
          <Badge variant="secondary" className="h-5 px-1.5 tabular-nums">{visible.length}</Badge>
        </CardTitle>
        <CardDescription className="text-xs">{t("description", { count: visible.length })}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-5">
        {groups.map(([source, items]) => (
          <Group key={source} source={source} leads={items} onDismiss={dismiss} />
        ))}
      </CardContent>
    </Card>
  )
}

function Group({ source, leads, onDismiss }: { source: string; leads: Lead[]; onDismiss: (ids: string[]) => void }) {
  const t = useTranslations("jobs.leads")
  const [all, setAll] = useState(false)
  const keywords = discoveredKeywords(source)
  const shown = all ? leads : leads.slice(0, SHORT)
  return (
    <section className="grid gap-2" aria-label={keywords ? t("fromSearch") : source}>
      <div className="flex min-w-0 items-center gap-2">
        {keywords ? <SearchIcon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden /> : null}
        <h3 className="shrink-0 text-xs font-medium">{keywords ? t("fromSearch") : source}</h3>
        {keywords ? (
          <ul className="flex min-w-0 flex-wrap gap-1">
            {keywords.map((word) => (
              <li key={word}><Badge variant="outline" className="h-5 px-1.5 font-normal text-muted-foreground">{word}</Badge></li>
            ))}
          </ul>
        ) : null}
        <span className="text-xs text-muted-foreground tabular-nums">{leads.length}</span>
        <Button variant="ghost" size="sm" className="ms-auto h-7 shrink-0 text-xs text-muted-foreground" onClick={() => onDismiss(leads.map((lead) => lead.id))}>
          {t("dismissAll")}
        </Button>
      </div>
      <ul className="divide-y overflow-hidden rounded-lg border">
        {shown.map((lead) => <Row key={lead.id} lead={lead} onDismiss={() => onDismiss([lead.id])} />)}
      </ul>
      {leads.length > SHORT ? (
        <Button variant="ghost" size="sm" className="justify-self-start text-xs" aria-expanded={all} onClick={() => setAll(!all)}>
          <ChevronDownIcon className={cn("transition-transform", all && "rotate-180")} /> {all ? t("showFewer") : t("showAll", { count: leads.length })}
        </Button>
      ) : null}
    </section>
  )
}

function Row({ lead, onDismiss }: { lead: Lead; onDismiss: () => void }) {
  const t = useTranslations("jobs.leads")
  const locale = useLocale()
  const [details, setDetails] = useState(false)
  const { role, company } = split(lead)
  const skills = lead.matches ?? []
  const meta = [company, lead.location, BOARD[lead.board] ?? lead.board, new Date(lead.foundAt).toLocaleDateString(locale, { day: "numeric", month: "short" })].filter(Boolean).join(" · ")
  return (
    <li className="group flex items-center gap-3 px-3 py-2.5 transition-colors hover:bg-muted/40">
      <EntryLogo path={lead.logoPath} name={company || role} size={32} className="rounded-md" />
      <div className="grid min-w-0 flex-1 gap-0.5">
        <HoverCard>
          <HoverCardTrigger delay={350} closeDelay={120} render={<button type="button" onClick={() => setDetails(true)} className="w-fit max-w-full truncate text-start text-sm font-medium underline-offset-2 hover:underline focus-visible:underline focus-visible:outline-none" />}>
            {role}
          </HoverCardTrigger>
          <HoverCardContent side="bottom" align="start" sideOffset={8} className="w-80 p-0">
            <LeadPreview lead={lead} role={role} company={company} meta={meta} onDetails={() => setDetails(true)} />
          </HoverCardContent>
        </HoverCard>
        <p className="truncate text-xs text-muted-foreground">{meta}</p>
      </div>
      {skills.length ? (
        <ul className="hidden max-w-80 shrink flex-wrap justify-end gap-1 max-h-5 overflow-hidden @3xl/workspace:flex" aria-label={t("matchesLabel")}>
          {skills.slice(0, 4).map((skill) => (
            <li key={skill}><Badge variant="secondary" className="h-5 px-1.5 font-normal">{skill}</Badge></li>
          ))}
          {skills.length > 4 ? <li><Badge variant="secondary" className="h-5 px-1.5 font-normal text-muted-foreground">+{skills.length - 4}</Badge></li> : null}
        </ul>
      ) : null}
      <div className="flex shrink-0 items-center gap-1">
        <ImportButton lead={lead} />
        <Button size="icon-sm" variant="ghost" className="text-muted-foreground" aria-label={t("dismiss", { title: lead.title || t("thisPosting") })} onClick={onDismiss}>
          <XIcon />
        </Button>
      </div>
      <LeadDetails lead={lead} role={role} company={company} meta={meta} open={details} onOpenChange={setDetails} onDismiss={onDismiss} />
    </li>
  )
}

function ImportButton({ lead, size = "sm", variant = "outline", onClick }: { lead: Lead; size?: "sm" | "default"; variant?: "outline" | "default"; onClick?: () => void }) {
  const t = useTranslations("jobs.leads")
  return (
    <Button size={size} variant={variant} nativeButton={false} render={<Link href={`/jobs?lead=${lead.id}`} scroll={false} onClick={onClick} />}>
      <PlusIcon data-icon="inline-start" /> {t("import")}
    </Button>
  )
}

/** Each part of a preview settles in a beat after the one above, so the card reads top to bottom. */
const settle = (step: number, className = "") => ({ className: cn("animate-in fade-in-0 slide-in-from-bottom-1 fill-mode-both duration-300 ease-out", className), style: { animationDelay: `${40 + step * 35}ms` } })

/** The hover card: who, where, the opening of the posting, and the skills it names. */
function LeadPreview({ lead, role, company, meta, onDetails }: { lead: Lead; role: string; company: string; meta: string; onDetails: () => void }) {
  const t = useTranslations("jobs.leads")
  const skills = lead.matches ?? []
  return (
    <div className="grid gap-3 p-3">
      <div {...settle(0, "flex items-start gap-3")}>
        <EntryLogo path={lead.logoPath} name={company || role} size={40} className="rounded-lg" />
        <div className="grid min-w-0 gap-0.5">
          <p className="line-clamp-2 text-sm font-semibold leading-snug">{role}</p>
          <p className="truncate text-xs text-muted-foreground">{meta}</p>
        </div>
      </div>
      {lead.facts?.length ? (
        <ul {...settle(1, "flex flex-wrap gap-1")}>
          {lead.facts.map((fact) => (
            <li key={fact}><ReBadge variant="outline" size="sm" className="font-normal">{fact}</ReBadge></li>
          ))}
        </ul>
      ) : null}
      {lead.excerpt ? <p {...settle(2, "line-clamp-4 text-xs leading-relaxed text-muted-foreground")}>{lead.excerpt}</p> : null}
      {skills.length ? (
        <div {...settle(3, "grid gap-1.5")}>
          <p className="text-[0.7rem] font-medium tracking-wide text-muted-foreground uppercase">{t("matchesLabel")}</p>
          <ul className="flex flex-wrap gap-1">
            {skills.slice(0, 8).map((skill) => (
              <li key={skill}><ReBadge variant="success-light" size="sm">{skill}</ReBadge></li>
            ))}
          </ul>
        </div>
      ) : null}
      <div {...settle(4, "flex items-center justify-end gap-1.5 border-t pt-3")}>
        <Button size="sm" variant="ghost" onClick={onDetails}>
          <PanelRightOpenIcon data-icon="inline-start" /> {t("details")}
        </Button>
        <ImportButton lead={lead} />
      </div>
    </div>
  )
}

/** The whole posting, loaded when opened, with what to do about it. */
function LeadDetails({ lead, role, company, meta, open, onOpenChange, onDismiss }: { lead: Lead; role: string; company: string; meta: string; open: boolean; onOpenChange: (open: boolean) => void; onDismiss: () => void }) {
  const t = useTranslations("jobs.leads")
  const [loaded, setLoaded] = useState<{ facts: string[]; body: string } | null>(null)
  const [error, setError] = useState("")
  const [, startLoad] = useTransition()
  // Opened from the row or the hover card: load the posting on the first open.
  useEffect(() => {
    if (!open || loaded || error) return
    startLoad(async () => {
      const result = await leadDetailsAction(lead.id).catch(() => ({ ok: false as const, message: t("detailsFailed") }))
      if (result.ok) setLoaded({ facts: result.facts, body: result.body })
      else setError(result.message)
    })
  }, [open, loaded, error, lead.id, t])
  const facts = loaded?.facts.length ? loaded.facts : (lead.facts ?? [])
  const skills = lead.matches ?? []
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="grid max-h-[88vh] grid-rows-[auto_minmax(0,1fr)_auto] gap-0 p-0 sm:max-w-2xl">
        <DialogHeader className="flex-row items-start gap-3 border-b p-4">
          <EntryLogo path={lead.logoPath} name={company || role} size={48} className="rounded-lg" />
          <div className="grid min-w-0 gap-1">
            <DialogTitle className="text-base leading-snug">{role}</DialogTitle>
            <DialogDescription className="truncate">{meta}</DialogDescription>
            {facts.length ? (
              <ul className="flex flex-wrap gap-1 pt-1">
                {facts.map((fact) => <li key={fact}><ReBadge variant="outline" size="sm" className="font-normal">{fact}</ReBadge></li>)}
              </ul>
            ) : null}
          </div>
        </DialogHeader>
        <div className="grid content-start gap-4 overflow-y-auto p-4">
          {skills.length ? (
            <div className="grid gap-1.5">
              <p className="text-[0.7rem] font-medium tracking-wide text-muted-foreground uppercase">{t("matchesLabel")}</p>
              <ul className="flex flex-wrap gap-1">{skills.map((skill) => <li key={skill}><ReBadge variant="success-light" size="sm">{skill}</ReBadge></li>)}</ul>
            </div>
          ) : null}
          {loaded ? (
            loaded.body ? (
              <JobDescription text={loaded.body} collapsible={false} className="animate-in fade-in-0 slide-in-from-bottom-1 duration-300" />
            ) : (
              <p className="text-sm text-muted-foreground">{t("noText")}</p>
            )
          ) : error ? (
            <p className="text-sm text-destructive">{error}</p>
          ) : (
            <div className="grid gap-2" aria-busy>
              {[96, 88, 92, 70, 84, 60].map((width, index) => <Skeleton key={index} className="h-3.5" style={{ width: `${width}%` }} />)}
            </div>
          )}
        </div>
        <DialogFooter className="m-0 flex-row items-center justify-between gap-2 rounded-b-xl border-t p-3 sm:justify-between">
          <Button variant="ghost" size="sm" nativeButton={false} render={<a href={lead.url} target="_blank" rel="noreferrer" />}>
            <ExternalLinkIcon data-icon="inline-start" /> {t("openOriginal", { board: BOARD[lead.board] ?? lead.board })}
          </Button>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => {
                onOpenChange(false)
                onDismiss()
              }}
            >
              {t("dismissShort")}
            </Button>
            <ImportButton lead={lead} size="default" variant="default" onClick={() => onOpenChange(false)} />
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
