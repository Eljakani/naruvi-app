"use client"

import { Otter } from "@/components/naruvi/otter"
import { useMemo, useState } from "react"
import { motion, useReducedMotion } from "motion/react"
import {
  AlertTriangleIcon,
  CheckIcon,
  CopyIcon,
  BadgeCheckIcon,
  ExternalLinkIcon,
  MailIcon,
  MapPinIcon,
  PencilIcon,
  PhoneIcon,
  PlusIcon,
  SearchIcon,
  UserRoundIcon,
  SparklesIcon,
} from "lucide-react"
import { EntryCard } from "@/components/profile/entry-card"
import Link from "next/link"
import { IdentityDialog } from "@/components/profile/identity-dialog"
import { SearchGoals } from "@/components/profile/search-goals"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Input } from "@/components/ui/input"
import type { profiles } from "@/server/db/schema"
import type { ProfileEntry } from "@/server/profile/repository"
import { useLocale, useTranslations } from "next-intl"

type Profile = typeof profiles.$inferSelect

/** Sections in the order a CV reads. */
const SECTIONS = [
  { kind: "experience" },
  { kind: "education" },
  { kind: "project" },
  { kind: "certification" },
  { kind: "skill" },
  { kind: "language" },
  { kind: "achievement" },
  { kind: "other" },
] as const

export function needsAttention(entry: ProfileEntry) {
  return entry.status !== "verified" || (entry.facts.length === 0 && (entry.kind === "experience" || entry.kind === "project"))
}

export function ProfileWorkspace({ profile, entries }: { profile: Profile | null; entries: ProfileEntry[] }) {
  const t = useTranslations("profile")
  const locale = useLocale()
  // The headline in the interface language when there is one, else in any language it's written in.
  const headline = profile ? profile.headlines[locale] || profile.headlines[profile.defaultLanguage] || Object.values(profile.headlines).find(Boolean) || "" : ""
  const [reviewOnly, setReviewOnly] = useState(false)
  const [query, setQuery] = useState("")
    const [identityOpen, setIdentityOpen] = useState(false)

  const active = entries.filter((entry) => entry.status !== "archived")
  const stats = useMemo(() => {
    const bullets = active.flatMap((entry) => entry.phrasings.filter((phrasing) => phrasing.role === "bullet"))
    const grounded = bullets.filter((phrasing) => phrasing.grounding.grounded).length
    return {
      facts: active.reduce((sum, entry) => sum + entry.facts.length, 0),
      bullets: bullets.length,
      grounded,
      attention: active.filter(needsAttention).length,
      verified: active.filter((entry) => entry.status === "verified").length,
    }
  }, [active])

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    return entries.filter((entry) => {
      if (entry.status === "archived" && !q) return false
      if (reviewOnly && !needsAttention(entry)) return false
      if (!q) return true
      const haystack = [
        ...Object.values(entry.fields).flatMap((value) => (typeof value === "string" ? [value] : [])),
        ...entry.tags,
        ...entry.skills,
        ...Object.values(entry.display).flatMap((display) => Object.values(display)),
        ...entry.facts.map((fact) => fact.statement),
        ...entry.phrasings.map((phrasing) => phrasing.text),
      ]
        .join(" ")
        .toLowerCase()
      return haystack.includes(q)
    })
  }, [entries, reviewOnly, query])
  const filtering = reviewOnly || Boolean(query.trim())

  if (!profile && entries.length === 0) {
    return (
      <>
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <UserRoundIcon />
            </EmptyMedia>
            <EmptyTitle>{t("start.title")}</EmptyTitle>
            <EmptyDescription>
              {t("start.body")}
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent className="flex-row justify-center gap-2">
            <Button nativeButton={false} render={<Link href="/profile/import" />}>
              <SparklesIcon /> {t("start.fromCv")}
            </Button>
            <Button variant="outline" nativeButton={false} render={<Link href="/profile/new" />}>
              <PlusIcon /> {t("addEntry")}
            </Button>
          </EmptyContent>
        </Empty>
      </>
    )
  }


  return (
    <>
      <Card>
        <CardContent className="grid gap-6 lg:grid-cols-[1fr_auto] lg:items-center">
          <div className="flex items-center gap-5">
            <button
              type="button"
              onClick={() => setIdentityOpen(true)}
              className="group/photo relative flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-full border bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              aria-label={profile?.photoPath ? t("changePhoto") : t("addPhoto")}
            >
              {profile?.photoPath ? (
                // eslint-disable-next-line @next/next/no-img-element -- local asset
                <img src={`/api/assets/${profile.photoPath}`} alt="" className="size-full object-cover" />
              ) : (
                <UserRoundIcon className="size-6 text-muted-foreground" />
              )}
              <span className="absolute inset-0 grid place-items-center bg-black/40 text-white opacity-0 transition-opacity group-hover/photo:opacity-100 group-focus-visible/photo:opacity-100">
                <PencilIcon className="size-4" />
              </span>
            </button>
            <div className="grid min-w-0 flex-1 gap-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="text-xl font-semibold tracking-tight text-balance sm:truncate">{profile?.fullName ?? t("yourName")}</h2>
                  {headline ? (
                    <p className="truncate text-sm text-muted-foreground">{headline}</p>
                  ) : (
                    <button type="button" onClick={() => setIdentityOpen(true)} className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
                      {t("addHeadline")}
                    </button>
                  )}
                </div>
                <Button size="sm" variant="outline" onClick={() => setIdentityOpen(true)}>
                  <PencilIcon /> <span className="max-sm:sr-only">{t("edit")}</span>
                </Button>
              </div>
              <div className="flex flex-wrap items-center gap-1.5 text-sm">
                {(
                  [
                    [MailIcon, profile?.email, "email", true],
                    [PhoneIcon, profile?.phone, "phone", true],
                    [MapPinIcon, profile?.location, "city", false],
                  ] as const
                ).map(([Icon, value, label, copyable]) =>
                  value ? (
                    copyable ? <CopyChip key={label} icon={Icon} value={value} label={t(`contact.${label}`)} /> : (
                      <span key={label} className="inline-flex h-7 min-w-0 items-center gap-1.5 rounded-full px-2.5 text-muted-foreground">
                        <Icon className="size-3.5 shrink-0" /> <span className="truncate">{value}</span>
                      </span>
                    )
                  ) : (
                    <button key={label} type="button" onClick={() => setIdentityOpen(true)} className="inline-flex h-7 items-center gap-1.5 rounded-full border border-dashed px-2.5 text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground">
                      <Icon className="size-3.5" /> {t("addContact", { field: t(`contact.${label}`) })}
                    </button>
                  ),
                )}
              </div>
              {profile?.links.length || profile?.availability ? (
                <div className="flex flex-wrap items-center gap-1.5">
                  {profile?.availability ? (
                    <span className="inline-flex h-6 items-center gap-1.5 rounded-full bg-success-soft px-2.5 text-xs font-medium text-success ring-1 ring-success/30">
                      <span className="relative flex size-1.5">
                        <span className="absolute inline-flex size-full animate-ping rounded-full bg-success opacity-60 motion-reduce:animate-none" />
                        <span className="relative inline-flex size-1.5 rounded-full bg-success" />
                      </span>
                      {t("available", { when: profile.availability })}
                    </span>
                  ) : null}
                  {profile?.links.map((link) => (
                    <a key={link.url} href={link.url} target="_blank" rel="noreferrer" className="inline-flex h-6 items-center gap-1.5 rounded-full border bg-background px-2.5 text-xs font-medium transition-colors hover:bg-muted">
                      <LinkIcon url={link.url} /> {link.label} <ExternalLinkIcon className="size-3 text-muted-foreground" />
                    </a>
                  ))}
                </div>
              ) : null}
            </div>
          </div>

          {/* Readiness: same card, separated by a rule, fixed width so both halves stay balanced. */}
          <div className="grid gap-3 border-t pt-5 lg:w-80 lg:border-t-0 lg:border-s lg:pt-0 lg:ps-6">
            <div className="flex items-center gap-3">
              {stats.attention ? <ReadyRing value={active.length - stats.attention} total={active.length} /> : <Otter pose="all-checked" height={64} className="-my-2" />}
              <div className="grid min-w-0 gap-0.5">
                <p className="text-sm font-medium">{stats.attention ? t("ready", { ready: active.length - stats.attention, total: active.length }) : t("allReady")}</p>
                <p className="text-xs text-muted-foreground">
                  {t("stats", { facts: stats.facts, percent: stats.bullets ? Math.round((stats.grounded / stats.bullets) * 100) : 100 })}
                </p>
              </div>
            </div>
            {stats.attention ? (
              <Button size="sm" variant="outline" className="w-full border-warning/30 bg-warning-soft text-warning hover:bg-warning-soft" nativeButton={false} render={<Link href="/profile/review" />}>
                <AlertTriangleIcon /> {t("review", { count: stats.attention })}
              </Button>
            ) : (
              <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <BadgeCheckIcon className="size-4 text-success" /> {t("checksOut")}
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      <SearchGoals goals={profile?.goals ?? []} location={profile?.location ?? ""} />

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-56 flex-1">
          <SearchIcon className="pointer-events-none absolute top-1/2 start-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("search")} aria-label={t("searchLabel")} className="ps-8" />
        </div>
        {stats.attention ? (
          <Button variant={reviewOnly ? "secondary" : "ghost"} onClick={() => setReviewOnly(!reviewOnly)} aria-pressed={reviewOnly}>
            <AlertTriangleIcon /> {t("needsLook", { count: stats.attention })}
          </Button>
        ) : null}
        <Button variant="outline" nativeButton={false} render={<Link href="/profile/import" />}>
          <SparklesIcon /> {t("addFromCv")}
        </Button>
        <Button nativeButton={false} render={<Link href="/profile/new" />}>
          <PlusIcon /> {t("addEntry")}
        </Button>
      </div>

      {filtering ? (
        visible.length ? (
          <div className="grid gap-2">
            {visible.map((entry) => (
              <EntryCard key={entry.id} entry={entry} attention={needsAttention(entry)} />
            ))}
          </div>
        ) : (
          <Empty className="border">
            <EmptyHeader>
              <EmptyTitle>{t("noMatch")}</EmptyTitle>
              <EmptyDescription>{t("noMatchBody")}</EmptyDescription>
            </EmptyHeader>
          </Empty>
        )
      ) : (
        <div className="grid gap-8">
          {SECTIONS.map((section) => {
            const items = visible.filter((entry) => (section.kind === "other" ? !SECTIONS.some((s) => s.kind !== "other" && s.kind === entry.kind) : entry.kind === section.kind))
            if (!items.length && (section.kind === "achievement" || section.kind === "other")) return null
            return (
              <section key={section.kind} className="grid gap-2" aria-labelledby={`section-${section.kind}`}>
                <div className="flex items-center justify-between gap-2">
                  <h2 id={`section-${section.kind}`} className="text-sm font-semibold">
                    {t(`sections.${section.kind}.title`)} <span className="font-normal text-muted-foreground tabular-nums">{items.length || ""}</span>
                  </h2>
                  <Button size="sm" variant="ghost" nativeButton={false} render={<Link href={`/profile/new?kind=${section.kind}`} />}>
                    <PlusIcon /> {t("add")}
                  </Button>
                </div>
                {items.length ? (
                  <div className="grid gap-2">
                    {items.map((entry) => (
                      <EntryCard key={entry.id} entry={entry} attention={needsAttention(entry)} />
                    ))}
                  </div>
                ) : (
                  <Link href={`/profile/new?kind=${section.kind}`} className="rounded-xl border border-dashed px-4 py-3 text-sm text-muted-foreground transition-colors hover:bg-muted/40">
                    {t(`sections.${section.kind}.empty`)}
                  </Link>
                )}
              </section>
            )
          })}
        </div>
      )}
      <IdentityDialog open={identityOpen} onOpenChange={setIdentityOpen} profile={profile} />
    </>
  )
}

function CopyChip({ icon: Icon, value, label }: { icon: React.ElementType; value: string; label: string }) {
  const t = useTranslations("profile")
  const [copied, setCopied] = useState(false)
  return (
    <button
      type="button"
      title={t("copy", { label })}
      onClick={() => {
        void navigator.clipboard.writeText(value)
        setCopied(true)
        setTimeout(() => setCopied(false), 1400)
      }}
      className="group inline-flex h-7 min-w-0 items-center gap-1.5 rounded-full px-2.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
    >
      <Icon className="size-3.5 shrink-0" />
      <span className="truncate">{value}</span>
      {copied ? <CheckIcon className="size-3 shrink-0 text-success" /> : <CopyIcon className="size-3 shrink-0 opacity-0 transition-opacity group-hover:opacity-60 group-focus-visible:opacity-60 pointer-coarse:opacity-60" />}
      <span className="sr-only" aria-live="polite">{copied ? t("copied") : ""}</span>
    </button>
  )
}

function LinkIcon({ url }: { url: string }) {
  if (/linkedin\.com/i.test(url))
    return <svg viewBox="0 0 24 24" className="size-3.5 fill-[#0A66C2]" aria-hidden><path d="M20.45 20.45h-3.56v-5.57c0-1.33-.02-3.04-1.85-3.04-1.85 0-2.14 1.45-2.14 2.94v5.67H9.35V9h3.41v1.56h.05c.48-.9 1.64-1.85 3.37-1.85 3.6 0 4.27 2.37 4.27 5.46v6.28ZM5.34 7.43a2.06 2.06 0 1 1 0-4.13 2.06 2.06 0 0 1 0 4.13ZM7.12 20.45H3.56V9h3.56v11.45ZM22.22 0H1.77C.79 0 0 .77 0 1.73v20.54C0 23.23.79 24 1.77 24h20.45c.98 0 1.78-.77 1.78-1.73V1.73C24 .77 23.2 0 22.22 0Z" /></svg>
  if (/github\.com/i.test(url))
    return <svg viewBox="0 0 24 24" className="size-3.5 fill-current" aria-hidden><path d="M12 .3a12 12 0 0 0-3.8 23.4c.6.1.8-.3.8-.6v-2.2c-3.3.7-4-1.4-4-1.4-.6-1.4-1.4-1.8-1.4-1.8-1-.7.1-.7.1-.7 1.2.1 1.8 1.2 1.8 1.2 1 1.8 2.8 1.3 3.5 1 0-.8.4-1.3.7-1.6-2.7-.3-5.5-1.3-5.5-6 0-1.2.5-2.3 1.3-3.1-.2-.4-.6-1.6 0-3.2 0 0 1-.3 3.4 1.2a11.5 11.5 0 0 1 6 0C17.3 4.6 18.3 5 18.3 5c.7 1.6.2 2.8.1 3.2.8.8 1.3 1.9 1.3 3.1 0 4.6-2.8 5.6-5.5 5.9.5.4.9 1.1.9 2.3v3.3c0 .3.1.7.8.6A12 12 0 0 0 12 .3" /></svg>
  return <ExternalLinkIcon className="size-3.5" />
}

function ReadyRing({ value, total }: { value: number; total: number }) {
  const reduce = useReducedMotion()
  const r = 20
  const c = 2 * Math.PI * r
  const share = total ? value / total : 0
  return (
    <div className="relative size-14 shrink-0">
      <svg viewBox="0 0 48 48" className="size-full -rotate-90">
        <circle cx="24" cy="24" r={r} className="fill-none stroke-muted" strokeWidth="4.5" />
        <motion.circle
          cx="24" cy="24" r={r} strokeWidth="4.5" strokeLinecap="round" strokeDasharray={c}
          className={share === 1 ? "fill-none stroke-success" : "fill-none stroke-brand"}
          initial={reduce ? false : { strokeDashoffset: c }}
          animate={{ strokeDashoffset: c * (1 - share) }}
          transition={{ duration: 0.8, ease: [0.23, 1, 0.32, 1] }}
        />
      </svg>
      <span className="absolute inset-0 grid place-content-center text-xs font-semibold tabular-nums">{Math.round(share * 100)}%</span>
    </div>
  )
}
