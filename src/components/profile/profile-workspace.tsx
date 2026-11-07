"use client"

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
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Input } from "@/components/ui/input"
import type { profiles } from "@/server/db/schema"
import type { ProfileEntry } from "@/server/profile/repository"

type Profile = typeof profiles.$inferSelect

/** Sections in the order a CV reads. */
const SECTIONS = [
  { kind: "experience", title: "Experience", empty: "Jobs, internships, freelance work, volunteering." },
  { kind: "education", title: "Education", empty: "Degrees, schools, bootcamps." },
  { kind: "project", title: "Projects", empty: "Things you built or led, at work or on your own." },
  { kind: "certification", title: "Certifications", empty: "Licences and certificates." },
  { kind: "skill", title: "Skills", empty: "Groups of skills, e.g. “Cloud” or “Customer service”." },
  { kind: "language", title: "Languages", empty: "Languages you speak and your level." },
  { kind: "achievement", title: "Achievements", empty: "Awards, competitions, publications." },
  { kind: "other", title: "Other", empty: "Anything else worth knowing." },
] as const

export function needsAttention(entry: ProfileEntry) {
  return entry.status !== "verified" || entry.phrasings.some((phrasing) => !phrasing.grounding.grounded) || entry.facts.length === 0
}

export function ProfileWorkspace({ profile, entries }: { profile: Profile | null; entries: ProfileEntry[] }) {
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
        entry.title,
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
            <EmptyTitle>Start your profile</EmptyTitle>
            <EmptyDescription>
              Upload your CV and AI fills your profile for you, or add entries by hand. Nothing is used for generation until you verify it.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent className="flex-row justify-center gap-2">
            <Button nativeButton={false} render={<Link href="/profile/import" />}>
              <SparklesIcon /> Start from my CV
            </Button>
            <Button variant="outline" nativeButton={false} render={<Link href="/profile/new" />}>
              <PlusIcon /> Add entry
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
              aria-label={profile?.photoPath ? "Change photo" : "Add a photo"}
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
                  <h2 className="truncate text-xl font-semibold tracking-tight">{profile?.fullName ?? "Your name"}</h2>
                  {profile?.headlines?.en || profile?.headlines?.fr ? (
                    <p className="truncate text-sm text-muted-foreground">{profile.headlines.en || profile.headlines.fr}</p>
                  ) : (
                    <button type="button" onClick={() => setIdentityOpen(true)} className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
                      + Add a one-line headline
                    </button>
                  )}
                </div>
                <Button size="sm" variant="outline" onClick={() => setIdentityOpen(true)}>
                  <PencilIcon /> Edit
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
                    copyable ? <CopyChip key={label} icon={Icon} value={value} label={label} /> : (
                      <span key={label} className="inline-flex h-7 min-w-0 items-center gap-1.5 rounded-full px-2.5 text-muted-foreground">
                        <Icon className="size-3.5 shrink-0" /> <span className="truncate">{value}</span>
                      </span>
                    )
                  ) : (
                    <button key={label} type="button" onClick={() => setIdentityOpen(true)} className="inline-flex h-7 items-center gap-1.5 rounded-full border border-dashed px-2.5 text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground">
                      <Icon className="size-3.5" /> Add {label}
                    </button>
                  ),
                )}
              </div>
              {profile?.links.length || profile?.availability ? (
                <div className="flex flex-wrap items-center gap-1.5">
                  {profile?.availability ? (
                    <span className="inline-flex h-6 items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 text-xs font-medium text-emerald-700 ring-1 ring-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:ring-emerald-900">
                      <span className="relative flex size-1.5">
                        <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-500 opacity-60 motion-reduce:animate-none" />
                        <span className="relative inline-flex size-1.5 rounded-full bg-emerald-500" />
                      </span>
                      Available {profile.availability}
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
          <div className="grid gap-3 border-t pt-5 lg:w-80 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-6">
            <div className="flex items-center gap-3">
              <ReadyRing value={active.length - stats.attention} total={active.length} />
              <div className="grid min-w-0 gap-0.5">
                <p className="text-sm font-medium">{stats.attention ? `${active.length - stats.attention} of ${active.length} entries ready` : "Every entry is ready"}</p>
                <p className="text-xs text-muted-foreground">
                  {stats.facts} facts · {stats.bullets ? Math.round((stats.grounded / stats.bullets) * 100) : 100}% of CV lines backed
                </p>
              </div>
            </div>
            {stats.attention ? (
              <Button size="sm" variant="outline" className="w-full border-amber-200 bg-amber-50/60 text-amber-800 hover:bg-amber-100 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300" nativeButton={false} render={<Link href="/profile/review" />}>
                <AlertTriangleIcon /> Review {stats.attention} {stats.attention === 1 ? "entry" : "entries"}
              </Button>
            ) : (
              <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <BadgeCheckIcon className="size-4 text-emerald-600" /> CVs can use everything.
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-56 flex-1">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search your profile…" className="pl-8" />
        </div>
        {stats.attention ? (
          <Button variant={reviewOnly ? "secondary" : "ghost"} onClick={() => setReviewOnly(!reviewOnly)} aria-pressed={reviewOnly}>
            <AlertTriangleIcon /> Needs a look · {stats.attention}
          </Button>
        ) : null}
        <Button variant="outline" nativeButton={false} render={<Link href="/profile/import" />}>
          <SparklesIcon /> Add from CV
        </Button>
        <Button nativeButton={false} render={<Link href="/profile/new" />}>
          <PlusIcon /> Add entry
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
              <EmptyTitle>Nothing matches</EmptyTitle>
              <EmptyDescription>Try another word, or clear the filter.</EmptyDescription>
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
                    {section.title} <span className="font-normal text-muted-foreground tabular-nums">{items.length || ""}</span>
                  </h2>
                  <Button size="sm" variant="ghost" nativeButton={false} render={<Link href={`/profile/new?kind=${section.kind}`} />}>
                    <PlusIcon /> Add
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
                    {section.empty}
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
  const [copied, setCopied] = useState(false)
  return (
    <button
      type="button"
      title={`Copy ${label}`}
      onClick={() => {
        void navigator.clipboard.writeText(value)
        setCopied(true)
        setTimeout(() => setCopied(false), 1400)
      }}
      className="group inline-flex h-7 min-w-0 items-center gap-1.5 rounded-full px-2.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
    >
      <Icon className="size-3.5 shrink-0" />
      <span className="truncate">{value}</span>
      {copied ? <CheckIcon className="size-3 shrink-0 text-emerald-600" /> : <CopyIcon className="size-3 shrink-0 opacity-0 transition-opacity group-hover:opacity-60" />}
      <span className="sr-only" aria-live="polite">{copied ? "Copied" : ""}</span>
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
          className={share === 1 ? "fill-none stroke-emerald-500" : "fill-none stroke-primary"}
          initial={reduce ? false : { strokeDashoffset: c }}
          animate={{ strokeDashoffset: c * (1 - share) }}
          transition={{ duration: 0.8, ease: [0.23, 1, 0.32, 1] }}
        />
      </svg>
      <span className="absolute inset-0 grid place-content-center text-xs font-semibold tabular-nums">{Math.round(share * 100)}%</span>
    </div>
  )
}
