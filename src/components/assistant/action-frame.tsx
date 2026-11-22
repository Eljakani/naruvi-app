"use client"

import { useId, type ReactNode } from "react"
import { CircleAlertIcon } from "lucide-react"
import { HoldToAllow } from "@/components/kokonutui/ai-tool-approval"
import { Alert, AlertDescription, AlertTitle } from "@/components/reui/alert"
import { Badge } from "@/components/reui/badge"
import { Frame, FrameDescription, FrameFooter, FramePanel, FrameTitle } from "@/components/reui/frame"
import { IconTile } from "@/components/reui/icon-tile"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

/** One labelled value of a proposed change ("Company · Northwind"). */
export type ActionRow = { label: string; value: string; hint?: string }
/** What an action proposes, laid out: labelled fields, plain lines, facts and skills. */
export type ActionBody = { rows: ActionRow[]; lines: string[]; facts: string[]; skills: string[] }

type Labels = { needsApproval: string; notNow: string; hold: string; holdLabel: string; destructive: string; facts: string; skills: string; failed: string }

/** The proposal itself, shared by every state of the card so the user always reads the same thing. */
export function ActionDetails({ body, labels, className }: { body: ActionBody; labels: Pick<Labels, "facts" | "skills">; className?: string }) {
  const { rows, lines, facts, skills } = body
  if (!rows.length && !lines.length && !facts.length && !skills.length) return null
  return (
    <div className={cn("grid gap-3 text-[13px]", className)}>
      {rows.length ? (
        <dl className="grid grid-cols-[minmax(0,auto)_minmax(0,1fr)] gap-x-4 gap-y-1.5">
          {rows.map((row, index) => (
            <div key={`${row.label}-${index}`} className="contents">
              <dt className="text-muted-foreground">
                {row.label}
                {row.hint ? <span className="ms-1 text-[11px] uppercase text-muted-foreground/70">{row.hint}</span> : null}
              </dt>
              <dd className="min-w-0 font-medium wrap-anywhere">{row.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      {lines.length ? (
        <ul className="grid gap-1 text-muted-foreground">
          {lines.map((line, index) => <li key={index} className="wrap-anywhere">{line}</li>)}
        </ul>
      ) : null}
      {facts.length ? (
        <section className="grid gap-1.5">
          <h4 className="text-xs font-medium text-muted-foreground">{labels.facts}</h4>
          <ul className="grid gap-1.5">
            {facts.map((fact, index) => (
              <li key={index} className="flex gap-2 leading-relaxed wrap-anywhere">
                <span aria-hidden className="mt-2 size-1 shrink-0 rounded-full bg-muted-foreground/60" />
                {fact}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {skills.length ? (
        <section className="grid gap-1.5">
          <h4 className="text-xs font-medium text-muted-foreground">{labels.skills}</h4>
          <div className="flex flex-wrap gap-1">
            {skills.map((skill) => <Badge key={skill} variant="outline" size="lg">{skill}</Badge>)}
          </div>
        </section>
      ) : null}
    </div>
  )
}

/**
 * An action Naruvi proposes, as a ReUI frame: what it is on top, exactly what
 * will change in the middle, and the decision (or its progress, or why it
 * failed) at the bottom. Escape declines while it asks.
 */
export function ActionFrame({
  icon,
  title,
  subtitle,
  body,
  labels,
  destructive,
  approveLabel,
  state,
  error,
  progress,
  onRespond,
}: {
  icon: ReactNode
  title: string
  subtitle?: string
  body: ActionBody
  labels: Labels
  destructive?: boolean
  approveLabel: string
  state: "asking" | "running" | "failed"
  error?: string
  progress?: ReactNode
  onRespond?: (approved: boolean) => void
}) {
  const titleId = useId()
  const failed = state === "failed"
  return (
    <Frame
      spacing="sm"
      role="group"
      aria-labelledby={titleId}
      className={cn("cb-step", failed && "[--frame-border-color:color-mix(in_oklch,var(--color-destructive)_30%,transparent)]")}
      onKeyDown={state === "asking" ? (event) => { if (event.key === "Escape") onRespond?.(false) } : undefined}
    >
      <FramePanel className="grid gap-3">
        <div className="flex items-start gap-2.5">
          <IconTile variant="soft" size="sm" className={failed || destructive ? "text-destructive" : "text-primary"}>
            {failed ? <CircleAlertIcon aria-hidden /> : icon}
          </IconTile>
          <div className="grid min-w-0 flex-1 gap-0.5">
            <FrameTitle id={titleId} className="leading-snug font-medium wrap-anywhere">{title}</FrameTitle>
            {subtitle ? <FrameDescription className="text-xs">{subtitle}</FrameDescription> : null}
          </div>
          {destructive ? <Badge variant="destructive-light" className="shrink-0">{labels.destructive}</Badge> : null}
        </div>
        <ActionDetails body={body} labels={labels} />
        {failed ? (
          <Alert variant="destructive">
            <CircleAlertIcon aria-hidden />
            <AlertTitle>{labels.failed}</AlertTitle>
            {error ? <AlertDescription className="text-xs wrap-anywhere">{error}</AlertDescription> : null}
          </Alert>
        ) : null}
      </FramePanel>
      {state === "asking" ? (
        <FrameFooter className="flex-row flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">{labels.needsApproval}</span>
          <div className="ms-auto flex items-center gap-1.5">
            <Button variant="ghost" size="sm" onClick={() => onRespond?.(false)}>{labels.notNow}</Button>
            {destructive ? (
              <HoldToAllow labels={labels} onConfirm={() => onRespond?.(true)} />
            ) : (
              <Button size="sm" onClick={() => onRespond?.(true)}>{approveLabel}</Button>
            )}
          </div>
        </FrameFooter>
      ) : state === "running" && progress ? (
        <FrameFooter>{progress}</FrameFooter>
      ) : null}
    </Frame>
  )
}
