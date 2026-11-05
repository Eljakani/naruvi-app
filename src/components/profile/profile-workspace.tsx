"use client"

import { useMemo, useState } from "react"
import {
  AlertTriangleIcon,
  BadgeCheckIcon,
  ExternalLinkIcon,
  MailIcon,
  MapPinIcon,
  PencilIcon,
  PhoneIcon,
  PlusIcon,
  SearchIcon,
  ShieldCheckIcon,
  UserRoundIcon,
  SparklesIcon,
} from "lucide-react"
import { EntryCard } from "@/components/profile/entry-card"
import Link from "next/link"
import { IdentityDialog } from "@/components/profile/identity-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Input } from "@/components/ui/input"
import { Progress } from "@/components/ui/progress"
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
      <div className="grid items-start gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardContent className="flex items-start gap-4">
            <button
              type="button"
              onClick={() => setIdentityOpen(true)}
              className="group/photo relative flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-full border bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
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
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm">
                {(
                  [
                    [MailIcon, profile?.email, "email"],
                    [PhoneIcon, profile?.phone, "phone"],
                    [MapPinIcon, profile?.location, "city"],
                  ] as const
                ).map(([Icon, value, label]) =>
                  value ? (
                    <span key={label} className="inline-flex min-w-0 items-center gap-1.5 text-muted-foreground">
                      <Icon className="size-3.5 shrink-0" /> <span className="truncate">{value}</span>
                    </span>
                  ) : (
                    <button key={label} type="button" onClick={() => setIdentityOpen(true)} className="inline-flex items-center gap-1.5 text-muted-foreground hover:text-foreground">
                      <Icon className="size-3.5" /> + Add {label}
                    </button>
                  ),
                )}
              </div>
              {profile?.links.length || profile?.availability ? (
                <div className="flex flex-wrap items-center gap-1.5">
                  {profile?.links.map((link) => (
                    <Button key={link.url} size="xs" variant="outline" nativeButton={false} render={<a href={link.url} target="_blank" rel="noreferrer" />}>
                      {link.label} <ExternalLinkIcon />
                    </Button>
                  ))}
                  {profile?.availability ? <Badge variant="secondary">Available {profile.availability}</Badge> : null}
                </div>
              ) : null}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardDescription>Your profile</CardDescription>
            <CardTitle className="text-2xl tabular-nums">
              {active.length - stats.attention} of {active.length} ready
            </CardTitle>
            <CardAction>
              <ShieldCheckIcon className="size-4 text-muted-foreground" />
            </CardAction>
          </CardHeader>
          <CardContent className="space-y-3">
            <Progress value={active.length ? ((active.length - stats.attention) / active.length) * 100 : 0} />
            {stats.attention ? (
              <>
                <p className="text-sm text-muted-foreground">
                  {stats.attention} {stats.attention === 1 ? "entry needs" : "entries need"} a quick look before CVs can use {stats.attention === 1 ? "it" : "them"}.
                </p>
                <Button size="sm" className="w-full" nativeButton={false} render={<Link href="/profile/review" />}>
                  <AlertTriangleIcon /> Review {stats.attention} {stats.attention === 1 ? "entry" : "entries"}
                </Button>
              </>
            ) : (
              <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <BadgeCheckIcon className="size-4 text-primary" /> Everything is checked. Every CV line is backed by your own facts.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

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
