"use client"

import Link from "next/link"
import { motion, useReducedMotion } from "motion/react"
import { ExternalLinkIcon, WalletIcon } from "lucide-react"
import { formatAmount } from "@/lib/salary"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import type { SalaryContext } from "@/server/salary/market"

const EASE = [0.23, 1, 0.32, 1] as const

type Row = { key: string; label: string; detail: string; low: number; high: number; mid?: number; tone: "primary" | "muted" | "market" }

/**
 * The posting's pay next to similar postings you saved and the market, on one
 * shared yearly scale, so "is this good?" can be read at a glance.
 */
export function SalaryCard({ context }: { context: SalaryContext }) {
  const reduce = useReducedMotion()
  const { posting, peers, market } = context
  const currency = posting?.currency ?? market?.currency ?? peers?.currency ?? null
  // Ranges in another currency would mislead on a shared axis.
  const sameCurrency = (other: string | null) => !currency || !other || other === currency
  const rows: Row[] = []
  if (posting) rows.push({ key: "posting", label: "This job", detail: context.postingText, low: posting.yearlyMin, high: posting.yearlyMax, tone: "primary" })
  if (peers && sameCurrency(peers.currency)) {
    const lows = peers.items.map((item) => item.min)
    const highs = peers.items.map((item) => item.max)
    rows.push({ key: "peers", label: "Your saved jobs", detail: `${peers.count} similar posting${peers.count === 1 ? "" : "s"} with a salary`, low: Math.min(...lows), high: Math.max(...highs), mid: peers.median, tone: "muted" })
  }
  if (market && sameCurrency(market.currency)) rows.push({ key: "market", label: `Market · ${market.where}`, detail: `Middle half of ${market.samples.toLocaleString()} Adzuna postings`, low: market.low, high: market.high, mid: market.median, tone: "market" })

  const min = rows.length ? Math.min(...rows.map((row) => row.low)) : 0
  const max = rows.length ? Math.max(...rows.map((row) => row.high)) : 1
  const pad = (max - min) * 0.12 || max * 0.1
  const lo = Math.max(0, min - pad)
  const span = max + pad - lo
  const at = (value: number) => ((value - lo) / span) * 100

  let verdict: string | null = null
  const reference = market?.median ?? peers?.median
  if (posting && reference && rows.length > 1) {
    const mid = (posting.yearlyMin + posting.yearlyMax) / 2
    const diff = Math.round(((mid - reference) / reference) * 100)
    verdict = Math.abs(diff) < 5 ? "In line with what similar roles pay." : diff > 0 ? `About ${diff}% above what similar roles pay.` : `About ${-diff}% below what similar roles pay. Worth raising when you negotiate.`
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><WalletIcon className="size-4" /> Pay</CardTitle>
        <CardDescription>
          {verdict ?? (rows.length ? "Yearly amounts, before tax." : "This posting doesn’t say what it pays.")}
          {!context.marketAvailable ? (
            <> <Link href="/integrations#salary-data" className="underline underline-offset-2 hover:text-foreground">Add market data</Link> to compare with other employers.</>
          ) : null}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {rows.length ? (
          <div className="grid gap-3">
            {rows.map((row, index) => (
              <div key={row.key} className="grid gap-1.5 sm:grid-cols-[9rem_minmax(0,1fr)] sm:items-center sm:gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{row.label}</p>
                  <p className="truncate text-xs text-muted-foreground" title={row.detail}>{row.detail}</p>
                </div>
                <Tooltip>
                  <TooltipTrigger render={<div className="relative h-7 rounded-md bg-muted/50" aria-label={`${row.label}: ${formatAmount(row.low, currency)} to ${formatAmount(row.high, currency)}`} />}>
                    <motion.div
                      className={row.tone === "primary" ? "absolute inset-y-1 rounded bg-primary" : row.tone === "market" ? "absolute inset-y-1 rounded bg-chart-2/70" : "absolute inset-y-1 rounded bg-foreground/20"}
                      style={{ left: `${at(row.low)}%`, originX: 0 }}
                      initial={reduce ? false : { width: 0, opacity: 0 }}
                      animate={{ width: `${Math.max(at(row.high) - at(row.low), 1.2)}%`, opacity: 1 }}
                      transition={{ duration: 0.6, delay: index * 0.08, ease: EASE }}
                    />
                    {row.mid ? (
                      <motion.span
                        className="absolute inset-y-0 w-0.5 rounded bg-foreground"
                        style={{ left: `${at(row.mid)}%` }}
                        initial={reduce ? false : { opacity: 0, scaleY: 0 }}
                        animate={{ opacity: 1, scaleY: 1 }}
                        transition={{ duration: 0.3, delay: 0.4 + index * 0.08, ease: EASE }}
                      />
                    ) : null}
                  </TooltipTrigger>
                  <TooltipContent>
                    {formatAmount(row.low, currency)} – {formatAmount(row.high, currency)}
                    {row.mid ? ` · middle ${formatAmount(row.mid, currency)}` : ""}
                  </TooltipContent>
                </Tooltip>
              </div>
            ))}
            <div className="flex justify-between text-[11px] tabular-nums text-muted-foreground sm:ms-[calc(9rem+0.75rem)]">
              <span>{formatAmount(lo, currency)}</span>
              <span>{formatAmount(lo + span / 2, currency)}</span>
              <span>{formatAmount(lo + span, currency)}</span>
            </div>
          </div>
        ) : null}
        {posting && posting.period !== "year" ? (
          <p className="text-xs text-muted-foreground">The posting gives a {posting.period === "hour" ? "rate per hour" : posting.period === "day" ? "day rate" : "monthly amount"}. Turned into a yearly figure ({posting.period === "hour" ? "1,607 hours" : posting.period === "day" ? "218 days" : "12 months"}) for comparison.</p>
        ) : null}
        <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
          <span>Check on</span>
          {[...context.links, ...(market ? [{ label: "Adzuna", url: market.url }] : [])].map((link) => (
            <a key={link.label} href={link.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 transition-colors hover:bg-muted hover:text-foreground">
              {link.label} <ExternalLinkIcon className="size-3" />
            </a>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
