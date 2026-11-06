"use client"

import Link from "next/link"
import { useCallback, useEffect, useMemo, useState, useTransition } from "react"
import {
  ArchiveIcon,
  ArrowLeftIcon,
  ArrowRightIcon,
  BadgeCheckIcon,
  CheckCircle2Icon,
  CircleAlertIcon,
  ExternalLinkIcon,
  PartyPopperIcon,
  PlusIcon,
  SkipForwardIcon,
  TagIcon,
} from "lucide-react"
import { toast } from "sonner"
import { addFactForBulletAction, linkBulletFactsAction, setBulletRoleAction, setEntryStatusAction } from "@/app/(app)/profile/actions"
import { EntryLogo } from "@/components/profile/entry-logo"
import { KIND_SINGULAR } from "@/components/profile/labels"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Progress } from "@/components/ui/progress"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import { verifySupport } from "@/server/domain/grounding"
import type { ReviewItem } from "@/server/profile/repository"

type Outcome = "fixed" | "skipped"

export function ReviewQueue({ items: initialItems }: { items: ReviewItem[] }) {
  // Freeze the queue for this session: server refreshes after each action
  // would otherwise remove resolved items and shift the current position.
  const [items] = useState(initialItems)
  const [index, setIndex] = useState(0)
  const [outcomes, setOutcomes] = useState<Record<string, Outcome>>({})
  const total = items.length
  const fixed = Object.values(outcomes).filter((value) => value === "fixed").length
  const item = items[index]

  const next = useCallback(
    (outcome: Outcome) => {
      if (!item) return
      setOutcomes((current) => ({ ...current, [item.id]: outcome }))
      // jump to the next unresolved item, wrapping once
      const order = [...items.slice(index + 1), ...items.slice(0, index)]
      const target = order.find((candidate) => !outcomes[candidate.id] && candidate.id !== item.id)
      setIndex(target ? items.indexOf(target) : items.length)
    },
    [index, item, items, outcomes],
  )

  if (total === 0 || index >= total) {
    return (
      <div className="mx-auto w-full max-w-3xl">
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">{total === 0 ? <BadgeCheckIcon /> : <PartyPopperIcon />}</EmptyMedia>
            <EmptyTitle>{total === 0 ? "Nothing to review" : "Review complete"}</EmptyTitle>
            <EmptyDescription>
              {total === 0
                ? "Every entry is verified and every bullet is backed by a fact."
                : `${fixed} of ${total} item${total === 1 ? "" : "s"} resolved${total - fixed ? `, ${total - fixed} skipped for later` : ""}.`}
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent className="flex-row justify-center gap-2">
            <Button nativeButton={false} render={<Link href="/profile" />}>
              Back to profile
            </Button>
            {total - fixed > 0 ? (
              <Button variant="outline" nativeButton={false} render={<Link href="/profile/review" />}>
                Review skipped
              </Button>
            ) : null}
          </EmptyContent>
        </Empty>
      </div>
    )
  }

  return (
    <div className="mx-auto grid w-full max-w-3xl gap-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" nativeButton={false} render={<Link href="/profile" />}>
          <ArrowLeftIcon /> Profile
        </Button>
        <div className="flex flex-1 items-center gap-3">
          <Progress value={((Object.keys(outcomes).length) / total) * 100} className="flex-1" />
          <span className="text-sm text-muted-foreground tabular-nums">
            {index + 1} / {total}
          </span>
        </div>
        <Button variant="ghost" size="icon-sm" aria-label="Previous" disabled={index === 0} onClick={() => setIndex(index - 1)}>
          <ArrowLeftIcon />
        </Button>
        <Button variant="ghost" size="icon-sm" aria-label="Next" disabled={index >= total - 1} onClick={() => setIndex(index + 1)}>
          <ArrowRightIcon />
        </Button>
      </div>

      {outcomes[item.id] ? (
        <p className="text-center text-xs text-muted-foreground">{outcomes[item.id] === "fixed" ? "Already resolved." : "Skipped earlier."}</p>
      ) : null}

      {item.type === "bullet" ? (
        <BulletReview key={item.id} item={item} onDone={next} />
      ) : (
        <EntryReview key={item.id} item={item} onDone={next} />
      )}

      <p className="text-center text-xs text-muted-foreground">
        {item.type === "bullet" ? (
          <>
            <Kbd>1</Kbd>–<Kbd>9</Kbd> toggle a fact ·{" "}
          </>
        ) : null}
        <Kbd>Enter</Kbd> confirm · <Kbd>S</Kbd> skip
      </p>
    </div>
  )
}

function EntryHeader({ entry }: { entry: ReviewItem["entry"] }) {
  const display = entry.display.en ?? entry.display.fr ?? {}
  return (
    <div className="flex items-center gap-3">
      <EntryLogo path={entry.logoPath} name={display.organization || entry.title} size={40} />
      <div className="min-w-0">
        <div className="truncate text-sm font-medium">{display.role || entry.title}</div>
        <div className="truncate text-xs text-muted-foreground">
          {KIND_SINGULAR[entry.kind]}
          {display.organization ? ` · ${display.organization}` : ""}
          {display.dates ? ` · ${display.dates}` : ""}
        </div>
      </div>
      <Button size="sm" variant="ghost" className="ml-auto text-muted-foreground" nativeButton={false} render={<Link href={`/profile/${entry.id}`} />}>
        <ExternalLinkIcon /> Open entry
      </Button>
    </div>
  )
}

function BulletReview({ item, onDone }: { item: Extract<ReviewItem, { type: "bullet" }>; onDone: (outcome: Outcome) => void }) {
  const { entry, bullet, suggestions } = item
  const [selected, setSelected] = useState<string[]>(() => [...new Set([...bullet.factIds, ...suggestions.filter((s) => s.score >= 0.6).map((s) => s.id)])])
  const [newFact, setNewFact] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const ordered = useMemo(() => {
    const rank = new Map(suggestions.map((s, i) => [s.id, i]))
    return [...entry.facts].sort((a, b) => (rank.get(a.id) ?? 99) - (rank.get(b.id) ?? 99))
  }, [entry.facts, suggestions])
  const check = verifySupport(bullet.text, entry.facts.filter((fact) => selected.includes(fact.id)))
  const toggle = (id: string) => setSelected((current) => (current.includes(id) ? current.filter((value) => value !== id) : [...current, id]))

  const confirm = useCallback(() => {
    startTransition(async () => {
      if (newFact !== null) {
        const result = await addFactForBulletAction(bullet.id, newFact, selected)
        if (!result.ok) return void toast.error(result.error)
        toast.success(result.data?.grounded ? "Fact added — bullet is backed" : "Fact added", { description: result.data?.grounded ? undefined : `Still unbacked: ${result.data?.unsupportedNumbers.join(", ")}` })
        if (result.data?.grounded) onDone("fixed")
        else setNewFact(null)
        return
      }
      if (!check.grounded) return void toast.error(check.unsupportedNumbers.length ? `No selected fact contains ${check.unsupportedNumbers.join(", ")}.` : "Select at least one fact.")
      const result = await linkBulletFactsAction(bullet.id, selected)
      if (!result.ok) return void toast.error(result.error)
      toast.success("Linked — bullet is backed")
      onDone("fixed")
    })
  }, [bullet.id, check.grounded, check.unsupportedNumbers, newFact, onDone, selected])

  const markLabel = () =>
    startTransition(async () => {
      const result = await setBulletRoleAction(bullet.id, "label")
      if (!result.ok) return void toast.error(result.error)
      toast.success("Marked as a label")
      onDone("fixed")
    })

  useShortcuts({
    onNumber: (n) => ordered[n - 1] && newFact === null && toggle(ordered[n - 1].id),
    onEnter: confirm,
    onSkip: () => onDone("skipped"),
    disabled: pending,
  })

  const reason = check.grounded ? null : check.unsupportedNumbers.length ? `No selected fact contains ${check.unsupportedNumbers.join(", ")}` : "No supporting fact selected"

  return (
    <Card>
      <CardHeader>
        <EntryHeader entry={entry} />
      </CardHeader>
      <CardContent className="grid gap-5">
        <div className="grid gap-2">
          <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground uppercase">
            <CircleAlertIcon className="size-3.5 text-amber-500" /> Bullet without proof
            <Badge variant="outline" className="font-mono text-[11px]">
              {bullet.language}
            </Badge>
            <span className="normal-case">· {bullet.group}</span>
          </div>
          <blockquote className="rounded-lg border border-amber-200 bg-amber-50/60 px-4 py-3 dark:border-amber-900 text-[15px] leading-relaxed dark:bg-amber-950/30">
            <HighlightNumbers text={bullet.text.replace(/\*\*(.+?)\*\*/g, "$1")} missing={check.unsupportedNumbers} />
          </blockquote>
        </div>

        <div className="grid gap-2">
          <div className="text-sm font-medium">Which facts prove it?</div>
          {ordered.length ? (
            <ul className="grid gap-1.5">
              {ordered.map((fact, i) => {
                const suggestion = suggestions.find((s) => s.id === fact.id)
                const on = selected.includes(fact.id)
                return (
                  <li key={fact.id}>
                    <label className={cn("flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors hover:bg-muted/50", on && "border-primary bg-primary/5")}>
                      <Checkbox checked={on} onCheckedChange={() => toggle(fact.id)} className="mt-0.5" disabled={newFact !== null} />
                      <span className="flex-1 text-sm">{fact.statement}</span>
                      {suggestion && suggestion.score >= 0.34 ? (
                        <Badge variant="secondary" className="shrink-0 text-[11px]">
                          {suggestion.sharedNumbers.length ? `shares ${suggestion.sharedNumbers.join(", ")}` : "suggested"}
                        </Badge>
                      ) : null}
                      {i < 9 ? <Kbd>{i + 1}</Kbd> : null}
                    </label>
                  </li>
                )
              })}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">This entry has no facts yet. Add the one that proves this bullet.</p>
          )}
        </div>

        {newFact !== null ? (
          <div className="grid gap-2 rounded-lg border border-dashed p-3">
            <div className="text-sm font-medium">New fact for {entry.title}</div>
            <Textarea autoFocus rows={2} value={newFact} onChange={(event) => setNewFact(event.target.value)} />
            <p className="text-xs text-muted-foreground">Write only what you can prove. Keep the exact numbers; this becomes part of your verified profile.</p>
            <div className="flex gap-2">
              <Button size="sm" variant="ghost" onClick={() => setNewFact(null)}>
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <Button variant="outline" size="sm" className="w-fit" onClick={() => setNewFact(bullet.text.replace(/\*\*(.+?)\*\*/g, "$1"))}>
            <PlusIcon /> It’s true but missing — add it as a fact
          </Button>
        )}
      </CardContent>
      <CardFooter className="flex flex-wrap items-center gap-2 border-t">
        {newFact === null ? (
          reason ? (
            <span className="text-xs text-amber-600">{reason}</span>
          ) : (
            <span className="inline-flex items-center gap-1 text-xs text-emerald-600">
              <CheckCircle2Icon className="size-3.5" /> Backed by {selected.length} fact{selected.length === 1 ? "" : "s"}
            </span>
          )
        ) : null}
        <div className="ml-auto flex flex-wrap gap-2">
          <Button variant="ghost" size="sm" onClick={markLabel} disabled={pending}>
            <TagIcon /> It’s a heading, not a claim
          </Button>
          <Button variant="ghost" size="sm" onClick={() => onDone("skipped")} disabled={pending}>
            <SkipForwardIcon /> Skip
          </Button>
          <Button size="sm" onClick={confirm} disabled={pending || (newFact === null ? !check.grounded : !newFact.trim())}>
            {newFact !== null ? "Add fact & link" : "Link & next"}
          </Button>
        </div>
      </CardFooter>
    </Card>
  )
}

function EntryReview({ item, onDone }: { item: Extract<ReviewItem, { type: "entry" }>; onDone: (outcome: Outcome) => void }) {
  const { entry, reasons } = item
  const [pending, startTransition] = useTransition()
  const ungrounded = entry.phrasings.filter((p) => p.role === "bullet" && !p.grounding.grounded).length
  const setStatus = (status: "verified" | "archived") =>
    startTransition(async () => {
      const result = await setEntryStatusAction(entry.id, status)
      if (!result.ok) return void toast.error(result.error)
      toast.success(status === "verified" ? "Verified" : "Archived")
      onDone("fixed")
    })
  useShortcuts({ onEnter: () => entry.facts.length && setStatus("verified"), onSkip: () => onDone("skipped"), disabled: pending })
  return (
    <Card>
      <CardHeader>
        <EntryHeader entry={entry} />
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="flex flex-wrap gap-2">
          {reasons.map((reason) => (
            <Badge key={reason} variant="outline" className="gap-1 border-amber-300 text-amber-700 dark:text-amber-400">
              <CircleAlertIcon className="size-3" /> {reason}
            </Badge>
          ))}
        </div>
        <div>
          <CardTitle className="text-sm">Is everything here true and current?</CardTitle>
          <CardDescription>Verified entries are the only ones Naruvi uses to write CVs.</CardDescription>
        </div>
        {entry.facts.length ? (
          <ul className="grid gap-1.5">
            {entry.facts.map((fact) => (
              <li key={fact.id} className="flex items-start gap-2 text-sm">
                <span className="mt-2 size-1.5 shrink-0 rounded-full bg-muted-foreground/50" />
                {fact.statement}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">No facts yet. Open the entry and add what you can prove before verifying it.</p>
        )}
        {ungrounded ? <p className="text-xs text-amber-600">{ungrounded} bullet{ungrounded === 1 ? "" : "s"} in this entry still need a fact; they appear separately in this queue.</p> : null}
      </CardContent>
      <CardFooter className="flex flex-wrap gap-2 border-t">
        <Button variant="ghost" size="sm" onClick={() => setStatus("archived")} disabled={pending}>
          <ArchiveIcon /> Archive
        </Button>
        <div className="ml-auto flex gap-2">
          <Button variant="ghost" size="sm" onClick={() => onDone("skipped")} disabled={pending}>
            <SkipForwardIcon /> Skip
          </Button>
          {entry.facts.length ? (
            <Button size="sm" onClick={() => setStatus("verified")} disabled={pending}>
              <BadgeCheckIcon /> Yes, mark verified
            </Button>
          ) : (
            <Button size="sm" nativeButton={false} render={<Link href={`/profile/${entry.id}#facts`} />}>
              Add facts
            </Button>
          )}
        </div>
      </CardFooter>
    </Card>
  )
}

function HighlightNumbers({ text, missing }: { text: string; missing: string[] }) {
  if (!missing.length) return <>{text}</>
  const parts = text.split(/(\$?\d[\d,.\s]*\d%?|\$?\d%?)/g)
  return (
    <>
      {parts.map((part, i) => {
        const normalized = part.replace(/[$,\s]/g, "").replace(/\.(?=\d{3}\b)/g, "")
        const isMissing = missing.some((n) => n === normalized || n === normalized.replace(/%$/, "") + "%" || n === normalized.replace(/%$/, ""))
        return isMissing ? (
          <mark key={i} className="rounded bg-amber-200 px-0.5 dark:bg-amber-800">
            {part}
          </mark>
        ) : (
          <span key={i}>{part}</span>
        )
      })}
    </>
  )
}

function Kbd({ children }: { children: React.ReactNode }) {
  return <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded border bg-muted px-1 font-mono text-[11px] text-muted-foreground">{children}</kbd>
}

function useShortcuts({ onNumber, onEnter, onSkip, disabled }: { onNumber?: (n: number) => void; onEnter: () => void; onSkip: () => void; disabled: boolean }) {
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement
      if (disabled || event.metaKey || event.ctrlKey || event.altKey) return
      const typing = target.tagName === "TEXTAREA" || (target.tagName === "INPUT" && (target as HTMLInputElement).type !== "checkbox")
      if (event.key === "Enter" && !event.shiftKey && (!typing || target.tagName === "TEXTAREA")) {
        event.preventDefault()
        onEnter()
      } else if (typing) return
      else if (/^[1-9]$/.test(event.key)) onNumber?.(Number(event.key))
      else if (event.key.toLowerCase() === "s") onSkip()
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [disabled, onEnter, onNumber, onSkip])
}
