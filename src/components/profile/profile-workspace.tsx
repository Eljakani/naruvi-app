"use client"

import { useMemo, useState, useTransition } from "react"
import {
  AlertTriangleIcon,
  BadgeCheckIcon,
  DownloadIcon,
  LockIcon,
  MailIcon,
  MapPinIcon,
  PencilIcon,
  PhoneIcon,
  PlusIcon,
  SearchIcon,
  ShieldCheckIcon,
  UserRoundIcon,
} from "lucide-react"
import { toast } from "sonner"
import { importProfileAction } from "@/app/(app)/profile/actions"
import { EntryCard } from "@/components/profile/entry-card"
import Link from "next/link"
import { IdentityDialog } from "@/components/profile/identity-dialog"
import { KIND_LABELS } from "@/components/profile/labels"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Progress } from "@/components/ui/progress"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import type { profiles } from "@/server/db/schema"
import type { ProfileEntry } from "@/server/profile/repository"

type Profile = typeof profiles.$inferSelect

const FILTERS = ["all", "attention", "experience", "project", "skill", "education", "certification", "other"] as const
type Filter = (typeof FILTERS)[number]

export function needsAttention(entry: ProfileEntry) {
  return entry.status !== "verified" || entry.phrasings.some((phrasing) => !phrasing.grounding.grounded) || entry.facts.length === 0
}

export function ProfileWorkspace({ profile, entries, defaultImportPath }: { profile: Profile | null; entries: ProfileEntry[]; defaultImportPath: string }) {
  const [filter, setFilter] = useState<Filter>("all")
  const [query, setQuery] = useState("")
    const [identityOpen, setIdentityOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)

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

  const counts = useMemo(() => {
    const map: Record<string, number> = { all: active.length, attention: stats.attention }
    for (const entry of active) {
      const key = ["experience", "project", "skill", "education", "certification"].includes(entry.kind) ? entry.kind : "other"
      map[key] = (map[key] ?? 0) + 1
    }
    return map
  }, [active, stats.attention])

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    return entries.filter((entry) => {
      if (filter === "attention" && !needsAttention(entry)) return false
      if (filter === "other" && ["experience", "project", "skill", "education", "certification"].includes(entry.kind)) return false
      if (!["all", "attention", "other"].includes(filter) && entry.kind !== filter) return false
      if (filter !== "attention" && entry.status === "archived" && filter === "all" && !q) return false
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
  }, [entries, filter, query])

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
              Import an existing profile folder (identity.md + pools/) or add your first entry by hand. Nothing is used for generation until you verify it.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent className="flex-row justify-center gap-2">
            <Button onClick={() => setImportOpen(true)}>
              <DownloadIcon /> Import folder
            </Button>
            <Button variant="outline" nativeButton={false} render={<Link href="/profile/new" />}>
              <PlusIcon /> Add entry
            </Button>
          </EmptyContent>
        </Empty>
        <ImportDialog open={importOpen} onOpenChange={setImportOpen} defaultPath={defaultImportPath} />
      </>
    )
  }

  const groundedPct = stats.bullets ? Math.round((stats.grounded / stats.bullets) * 100) : 100

  return (
    <>
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-xl">{profile?.fullName ?? "Your name"}</CardTitle>
            <CardDescription className="flex flex-wrap gap-x-4 gap-y-1">
              {profile?.email ? (
                <span className="inline-flex items-center gap-1.5">
                  <MailIcon className="size-3.5" /> {profile.email}
                </span>
              ) : null}
              {profile?.phone ? (
                <span className="inline-flex items-center gap-1.5">
                  <PhoneIcon className="size-3.5" /> {profile.phone}
                </span>
              ) : null}
              {profile?.location ? (
                <span className="inline-flex items-center gap-1.5">
                  <MapPinIcon className="size-3.5" /> {profile.location}
                </span>
              ) : null}
            </CardDescription>
            <CardAction>
              <Button size="sm" variant="outline" onClick={() => setIdentityOpen(true)}>
                <PencilIcon /> Edit
              </Button>
            </CardAction>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center gap-2">
            {profile?.links.map((link) => (
              <Badge key={link.url} variant="secondary" render={<a href={link.url} target="_blank" rel="noreferrer" />}>
                {link.label}
              </Badge>
            ))}
            {profile?.availability ? <Badge variant="outline">Available {profile.availability}</Badge> : null}
            {profile?.locked.length ? (
              <Badge variant="outline" className="gap-1">
                <LockIcon className="size-3" /> Contact locked for generation
              </Badge>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardDescription>Grounding</CardDescription>
            <CardTitle className="text-3xl tabular-nums">{groundedPct}%</CardTitle>
            <CardAction>
              <ShieldCheckIcon className="size-4 text-muted-foreground" />
            </CardAction>
          </CardHeader>
          <CardContent className="space-y-3">
            <Progress value={groundedPct} />
            <p className="text-xs text-muted-foreground">
              {stats.grounded}/{stats.bullets} approved bullets are backed by facts · {stats.facts} facts in {stats.verified} verified entries
            </p>
            {stats.attention ? (
              <Button size="sm" variant="outline" className="w-full" onClick={() => setFilter("attention")}>
                <AlertTriangleIcon className="text-amber-500" /> Review {stats.attention} {stats.attention === 1 ? "entry" : "entries"}
              </Button>
            ) : (
              <div className="flex items-center gap-1.5 text-xs text-emerald-600">
                <BadgeCheckIcon className="size-3.5" /> Everything is verified and grounded.
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <Tabs value={filter} onValueChange={(value) => setFilter(value as Filter)}>
          <TabsList className="h-auto flex-wrap">
            {FILTERS.map((key) => (
              <TabsTrigger key={key} value={key} className="gap-1.5">
                {key === "attention" ? <AlertTriangleIcon className="size-3.5 text-amber-500" /> : null}
                {key === "all" ? "All" : key === "attention" ? "Needs review" : KIND_LABELS[key]}
                <span className="text-xs text-muted-foreground tabular-nums">{counts[key] ?? 0}</span>
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <div className="flex items-center gap-2">
          <div className="relative w-full lg:w-64">
            <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search facts, tools, bullets…" className="pl-8" />
          </div>
          <Button variant="outline" onClick={() => setImportOpen(true)}>
            <DownloadIcon /> Import
          </Button>
          <Button nativeButton={false} render={<Link href="/profile/new" />}>
            <PlusIcon /> Add entry
          </Button>
        </div>
      </div>

      {visible.length ? (
        <div className="grid gap-3">
          {visible.map((entry) => (
            <EntryCard key={entry.id} entry={entry} attention={needsAttention(entry)} />
          ))}
        </div>
      ) : (
        <Empty className="border">
          <EmptyHeader>
            <EmptyTitle>No entries match</EmptyTitle>
            <EmptyDescription>Try another filter or search term.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}
      <IdentityDialog open={identityOpen} onOpenChange={setIdentityOpen} profile={profile} />
      <ImportDialog open={importOpen} onOpenChange={setImportOpen} defaultPath={defaultImportPath} />
    </>
  )
}

function ImportDialog({ open, onOpenChange, defaultPath }: { open: boolean; onOpenChange: (open: boolean) => void; defaultPath: string }) {
  const [path, setPath] = useState(defaultPath)
  const [pending, startTransition] = useTransition()
  const submit = () =>
    startTransition(async () => {
      const result = await importProfileAction(path)
      if (!result.ok) {
        toast.error("Import failed", { description: result.error })
        return
      }
      const summary = result.data!
      toast.success(`Imported ${summary.entries} entries`, {
        description: `${summary.facts} facts, ${summary.phrasings} phrasings${summary.ungrounded.length ? ` · ${summary.ungrounded.length} bullets need a fact link` : ""}.`,
      })
      onOpenChange(false)
    })
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Import a profile folder</DialogTitle>
          <DialogDescription>
            A folder with <code>identity.md</code> and <code>pools/**/*.md</code>. Entries are matched by their ID, so importing again updates them instead of duplicating.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-2">
          <Label htmlFor="import-path">Folder path on this machine</Label>
          <Input id="import-path" value={path} onChange={(event) => setPath(event.target.value)} placeholder="/home/you/my-cv/profile" />
        </div>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
          <Button onClick={submit} disabled={pending || !path.trim()}>
            <DownloadIcon /> {pending ? "Importing…" : "Import"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
