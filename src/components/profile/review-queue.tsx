"use client"

import Link from "next/link"
import { useCallback, useEffect, useState, useTransition } from "react"
import {
  ArchiveIcon,
  ArrowLeftIcon,
  ArrowRightIcon,
  BadgeCheckIcon,
  CircleAlertIcon,
  PartyPopperIcon,
  PencilIcon,
  SkipForwardIcon,
} from "lucide-react"
import { toast } from "sonner"
import { setEntryStatusAction } from "@/app/[locale]/(app)/profile/actions"
import { EntryLogo } from "@/components/profile/entry-logo"
import { KIND_SINGULAR, type Kind } from "@/components/profile/labels"

const REASON_KEY = { "Not verified yet": "notVerified", "No facts": "noFacts" } as const
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Progress } from "@/components/ui/progress"
import type { ReviewItem } from "@/server/profile/repository"
import { useTranslations } from "next-intl"

type Outcome = "fixed" | "skipped"

export function ReviewQueue({ items: initialItems }: { items: ReviewItem[] }) {
  const t = useTranslations("reviewQueue")
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
            <EmptyTitle>{total === 0 ? t("nothing") : t("complete")}</EmptyTitle>
            <EmptyDescription>
              {total === 0
                ? t("allGood")
                : total - fixed ? t("resolvedSkipped", { fixed, total, skipped: total - fixed }) : t("resolved", { fixed, total })}
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent className="flex-row justify-center gap-2">
            <Button nativeButton={false} render={<Link href="/profile" />}>
              {t("backToProfile")}
            </Button>
            {total - fixed > 0 ? (
              <Button variant="outline" nativeButton={false} render={<Link href="/profile/review" />}>
                {t("reviewSkipped")}
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
          <ArrowLeftIcon /> {t("profile")}
        </Button>
        <div className="flex flex-1 items-center gap-3">
          <Progress value={((Object.keys(outcomes).length) / total) * 100} className="flex-1" />
          <span className="text-sm text-muted-foreground tabular-nums">
            {index + 1} / {total}
          </span>
        </div>
        <Button variant="ghost" size="icon-sm" aria-label={t("previous")} disabled={index === 0} onClick={() => setIndex(index - 1)}>
          <ArrowLeftIcon />
        </Button>
        <Button variant="ghost" size="icon-sm" aria-label={t("next")} disabled={index >= total - 1} onClick={() => setIndex(index + 1)}>
          <ArrowRightIcon />
        </Button>
      </div>

      {outcomes[item.id] ? (
        <p className="text-center text-xs text-muted-foreground">{outcomes[item.id] === "fixed" ? t("alreadyResolved") : t("skippedEarlier")}</p>
      ) : null}

      <EntryReview key={item.id} item={item} onDone={next} />

      <p className="text-center text-xs text-muted-foreground">
        <Kbd>Enter</Kbd> {t("keys.confirm")} · <Kbd>S</Kbd> {t("keys.skip")}
      </p>
    </div>
  )
}

function EntryHeader({ entry }: { entry: ReviewItem["entry"] }) {
  const tk = useTranslations("profileLabels.kindSingular")
  const t = useTranslations("reviewQueue")
  const display = entry.display.en ?? entry.display.fr ?? {}
  return (
    <div className="flex items-center gap-3">
      <EntryLogo path={entry.logoPath} name={display.organization || entry.title} size={40} />
      <div className="min-w-0">
        <div className="truncate text-sm font-medium">{display.role || entry.title}</div>
        <div className="truncate text-xs text-muted-foreground">
          {entry.kind in KIND_SINGULAR ? tk(entry.kind as Kind) : entry.kind}
          {display.organization ? ` · ${display.organization}` : ""}
          {display.dates ? ` · ${display.dates}` : ""}
        </div>
      </div>
      <Button size="sm" variant="ghost" className="ms-auto text-muted-foreground" nativeButton={false} render={<Link href={`/profile/${entry.id}`} />}>
        <PencilIcon /> {t("openEntry")}
      </Button>
    </div>
  )
}

function EntryReview({ item, onDone }: { item: ReviewItem; onDone: (outcome: Outcome) => void }) {
  const t = useTranslations("reviewQueue")
  const { entry, reasons } = item
  const [pending, startTransition] = useTransition()
  const setStatus = (status: "verified" | "archived") =>
    startTransition(async () => {
      const result = await setEntryStatusAction(entry.id, status)
      if (!result.ok) return void toast.error(result.error)
      toast.success(status === "verified" ? t("verified") : t("archived"))
      onDone("fixed")
    })
  useShortcuts({ onEnter: () => setStatus("verified"), onSkip: () => onDone("skipped"), disabled: pending })
  return (
    <Card>
      <CardHeader>
        <EntryHeader entry={entry} />
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="flex flex-wrap gap-2">
          {reasons.map((reason) => (
            <Badge key={reason} variant="outline" className="gap-1 border-amber-300 text-amber-700 dark:text-amber-400">
              <CircleAlertIcon className="size-3" /> {reason in REASON_KEY ? t(`reasons.${REASON_KEY[reason as keyof typeof REASON_KEY]}`) : reason}
            </Badge>
          ))}
        </div>
        <div>
          <CardTitle className="text-sm">{t("isTrue")}</CardTitle>
          <CardDescription>{t("isTrueHint")}</CardDescription>
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
        ) : reasons.includes("No facts") ? (
          <p className="text-sm text-muted-foreground">{t("noFactsOpen")}</p>
        ) : null}
      </CardContent>
      <CardFooter className="flex flex-wrap gap-2 border-t">
        <Button variant="ghost" size="sm" onClick={() => setStatus("archived")} disabled={pending}>
          <ArchiveIcon /> {t("archive")}
        </Button>
        <div className="ms-auto flex gap-2">
          <Button variant="ghost" size="sm" onClick={() => onDone("skipped")} disabled={pending}>
            <SkipForwardIcon /> {t("skip")}
          </Button>
          <Button size="sm" onClick={() => setStatus("verified")} disabled={pending}>
            <BadgeCheckIcon /> {t("markVerified")}
          </Button>
        </div>
      </CardFooter>
    </Card>
  )
}

function Kbd({ children }: { children: React.ReactNode }) {
  return <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded border bg-muted px-1 font-mono text-[11px] text-muted-foreground">{children}</kbd>
}

function useShortcuts({ onEnter, onSkip, disabled }: { onEnter: () => void; onSkip: () => void; disabled: boolean }) {
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement
      if (disabled || event.metaKey || event.ctrlKey || event.altKey) return
      const typing = target.tagName === "TEXTAREA" || (target.tagName === "INPUT" && (target as HTMLInputElement).type !== "checkbox")
      if (event.key === "Enter" && !event.shiftKey && (!typing || target.tagName === "TEXTAREA")) {
        event.preventDefault()
        onEnter()
      } else if (typing) return
      else if (event.key.toLowerCase() === "s") onSkip()
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [disabled, onEnter, onSkip])
}
