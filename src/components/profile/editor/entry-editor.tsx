"use client"

import { useRouter } from "next/navigation"
import { useCallback, useEffect, useMemo, useState, useTransition } from "react"
import {
  AlertTriangleIcon,
  ArrowLeftIcon,
  AwardIcon,
  BookOpenIcon,
  BriefcaseBusinessIcon,
  CheckCircle2Icon,
  CircleDashedIcon,
  CopyIcon,
  FolderGit2Icon,
  GraduationCapIcon,
  LanguagesIcon,
  LockIcon,
  MoreHorizontalIcon,
  PlusIcon,
  ShapesIcon,
  TrashIcon,
  TrophyIcon,
  WrenchIcon,
  XIcon,
} from "lucide-react"
import { toast } from "sonner"
import { deleteEntryAction, saveEntryAction } from "@/app/(app)/profile/actions"
import { EntryLogo } from "@/components/profile/entry-logo"
import { LogoField } from "@/components/profile/editor/logo-field"
import { ChipInput, FactPicker, GrowText, LineList, StringLineList } from "@/components/profile/editor/inputs"
import { type Draft, type DraftBullet, type Lang, LANGS, newKey, pairRows, toDraft, toInput } from "@/components/profile/editor/draft"
import { KIND_SINGULAR, STATUS_LABELS } from "@/components/profile/labels"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { cn } from "@/lib/utils"
import { verifySupport } from "@/server/domain/grounding"
import type { ProfileEntry } from "@/server/profile/repository"
import { entryKinds, entryStatuses } from "@/server/profile/schemas"

const KIND_ICONS = {
  experience: BriefcaseBusinessIcon,
  project: FolderGit2Icon,
  education: GraduationCapIcon,
  certification: AwardIcon,
  skill: WrenchIcon,
  language: LanguagesIcon,
  achievement: TrophyIcon,
  other: ShapesIcon,
} as const

const FIELD_COPY: Record<Draft["kind"], { role: string; organization: string; rolePlaceholder: string; orgPlaceholder: string }> = {
  experience: { role: "Role", organization: "Company", rolePlaceholder: "DevSecOps Engineer", orgPlaceholder: "Oracle" },
  project: { role: "Project name", organization: "Context", rolePlaceholder: "SIEMtinel", orgPlaceholder: "Personal project" },
  education: { role: "Degree", organization: "School", rolePlaceholder: "MSc Cybersecurity", orgPlaceholder: "Télécom Paris" },
  certification: { role: "Certification", organization: "Issuer", rolePlaceholder: "KCNA", orgPlaceholder: "Linux Foundation" },
  skill: { role: "Cluster label", organization: "Context", rolePlaceholder: "DevSecOps & Cloud", orgPlaceholder: "" },
  language: { role: "Label", organization: "Context", rolePlaceholder: "Languages", orgPlaceholder: "" },
  achievement: { role: "Title", organization: "Event / issuer", rolePlaceholder: "1st place", orgPlaceholder: "WOCS'hAck 2026" },
  other: { role: "Title", organization: "Organization", rolePlaceholder: "", orgPlaceholder: "" },
}

const LOGO_KINDS = new Set<Draft["kind"]>(["experience", "education", "project", "certification", "achievement"])

const SECTIONS = [
  { id: "basics", label: "Basics" },
  { id: "display", label: "How it appears" },
  { id: "facts", label: "Facts" },
  { id: "bullets", label: "Bullets" },
  { id: "guardrails", label: "Guardrails" },
] as const

export function EntryEditor({ entry }: { entry: ProfileEntry | null }) {
  const router = useRouter()
  const [initial] = useState(() => toDraft(entry))
  const [draft, setDraft] = useState<Draft>(initial)
  const [lang, setLang] = useState<Lang>("en")
  const [previewLang, setPreviewLang] = useState<Lang>("en")
  const [hoverFact, setHoverFact] = useState<string | null>(null)
  const [confirmLeave, setConfirmLeave] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [pending, startTransition] = useTransition()

  const dirty = useMemo(() => JSON.stringify(draft) !== JSON.stringify(initial), [draft, initial])
  const patch = useCallback((value: Partial<Draft>) => setDraft((current) => ({ ...current, ...value })), [])
  const copy = FIELD_COPY[draft.kind]

  /* ---------- derived: grounding + readiness ---------- */
  const facts = draft.facts.filter((fact) => fact.statement.trim())
  const grounding = useMemo(() => {
    const out: Record<string, ReturnType<typeof verifySupport>> = {}
    for (const bullet of draft.bullets) {
      out[bullet.key] =
        bullet.role === "label"
          ? { grounded: true, unsupportedNumbers: [], factIds: [] }
          : verifySupport(bullet.text, facts.filter((fact) => bullet.factKeys.includes(fact.key)).map((fact) => ({ id: fact.key, statement: fact.statement })))
    }
    return out
  }, [draft.bullets, facts])
  const usage = useMemo(() => {
    const map: Record<string, number> = {}
    for (const bullet of draft.bullets) for (const key of bullet.factKeys) map[key] = (map[key] ?? 0) + 1
    return map
  }, [draft.bullets])
  const claimBullets = draft.bullets.filter((bullet) => bullet.role === "bullet" && bullet.text.trim())
  const ungrounded = claimBullets.filter((bullet) => !grounding[bullet.key]?.grounded)
  const readiness = [
    { label: "Named", done: Boolean(draft.display.en.role || draft.display.fr.role || draft.title.trim()), section: "basics" },
    { label: "English display", done: Boolean(draft.display.en.role), section: "display" },
    { label: "French display", done: Boolean(draft.display.fr.role), section: "display" },
    { label: draft.kind === "skill" ? "Skills listed" : "At least one fact", done: draft.kind === "skill" ? draft.skills.length > 0 : facts.length > 0, section: draft.kind === "skill" ? "guardrails" : "facts" },
    { label: ungrounded.length ? `${ungrounded.length} bullet${ungrounded.length === 1 ? "" : "s"} not backed` : "Every bullet backed by facts", done: ungrounded.length === 0, section: "bullets" },
    { label: "Marked verified", done: draft.status === "verified", section: "basics" },
  ]
  const ready = readiness.filter((item) => item.done).length

  /* ---------- save / delete / leave ---------- */
  const save = useCallback(
    (then?: string) =>
      startTransition(async () => {
        const result = await saveEntryAction(toInput(draft), entry?.id)
        if (!result.ok) return void toast.error("Could not save", { description: result.error })
        toast.success(entry ? "Saved" : "Entry created", {
          description: ungrounded.length ? `${ungrounded.length} bullet(s) still need a supporting fact.` : "Every bullet is backed by a fact.",
        })
        if (then) router.push(then)
        else if (!entry && result.data) router.replace(`/profile/${result.data}`)
        else router.refresh()
      }),
    [draft, entry, router, ungrounded.length],
  )

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
        event.preventDefault()
        if (dirty && !pending) save()
      }
    }
    const onUnload = (event: BeforeUnloadEvent) => {
      if (dirty) event.preventDefault()
    }
    window.addEventListener("keydown", onKey)
    window.addEventListener("beforeunload", onUnload)
    return () => {
      window.removeEventListener("keydown", onKey)
      window.removeEventListener("beforeunload", onUnload)
    }
  }, [dirty, pending, save])

  const leave = (href: string) => (dirty ? setConfirmLeave(href) : router.push(href))
  const remove = () =>
    startTransition(async () => {
      if (!entry) return
      const result = await deleteEntryAction(entry.id)
      if (!result.ok) return void toast.error("Could not delete", { description: result.error })
      toast.success("Entry deleted")
      router.push("/profile")
    })
  const jump = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" })

  /* ---------- bullets helpers ---------- */
  const groups = [...new Set(draft.bullets.map((bullet) => bullet.group))]
  const updateBullet = (key: string, value: Partial<DraftBullet>) => patch({ bullets: draft.bullets.map((bullet) => (bullet.key === key ? { ...bullet, ...value } : bullet)) })
  const addBullet = (group: string, language: Lang) => patch({ bullets: [...draft.bullets, { key: newKey(), group, role: "bullet", language, text: "", factKeys: [] }] })
  const addGroup = () => {
    const name = groups.includes("General") ? `Group ${groups.length + 1}` : "General"
    patch({ bullets: [...draft.bullets, ...LANGS.map((language) => ({ key: newKey(), group: name, role: "bullet" as const, language, text: "", factKeys: [] }))] })
  }
  const renameGroup = (from: string, to: string) => patch({ bullets: draft.bullets.map((bullet) => (bullet.group === from ? { ...bullet, group: to } : bullet)) })

  const title = draft.display.en.role || draft.display.fr.role || draft.title || "New entry"

  return (
    <div className="-mx-4 -mt-4 md:-mx-6 md:-mt-6">
      {/* sticky action bar */}
      <div className="sticky top-0 z-20 flex flex-wrap items-center gap-3 border-b bg-background/85 px-4 py-3 backdrop-blur md:px-6">
        <Button variant="ghost" size="sm" onClick={() => leave("/profile")}>
          <ArrowLeftIcon /> Profile
        </Button>
        {LOGO_KINDS.has(draft.kind) ? <EntryLogo path={draft.logoPath} name={draft.display.en.organization || title} size={32} /> : null}
        <div className="min-w-0 flex-1">
          <div className="truncate font-semibold">{title}</div>
          <div className="text-xs text-muted-foreground">
            {KIND_SINGULAR[draft.kind]} · {dirty ? <span className="text-amber-600">Unsaved changes</span> : entry ? "All changes saved" : "Not saved yet"}
          </div>
        </div>
        <ToggleGroup value={[draft.status]} onValueChange={(value) => value[0] && patch({ status: value[0] as Draft["status"] })} variant="outline" size="sm" aria-label="Status">
          {entryStatuses.map((status) => (
            <ToggleGroupItem key={status} value={status} className="px-2.5 text-xs aria-pressed:border-foreground aria-pressed:bg-foreground aria-pressed:text-background">
              {status === "verified" ? <CheckCircle2Icon /> : null}
              {STATUS_LABELS[status]}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        {entry ? (
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label="More actions" />}>
              <MoreHorizontalIcon />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem variant="destructive" onClick={() => setConfirmDelete(true)}>
                <TrashIcon /> Delete entry
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
        <Button onClick={() => save()} disabled={pending || (!dirty && Boolean(entry))}>
          {pending ? "Saving…" : entry ? "Save" : "Create entry"}
          <kbd className="ml-1 hidden rounded bg-primary-foreground/15 px-1 font-mono text-[10px] sm:inline">⌘S</kbd>
        </Button>
      </div>

      <div className="grid gap-6 p-4 md:p-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="grid min-w-0 gap-6">
          {/* 1. basics */}
          <Section id="basics" n={1} title="What is it?" description="Pick the type first; the fields below adapt to it.">
            <ToggleGroup value={[draft.kind]} onValueChange={(value) => value[0] && patch({ kind: value[0] as Draft["kind"] })} variant="outline" className="flex w-full flex-wrap justify-start" spacing={2} aria-label="Entry type">
              {entryKinds.map((kind) => {
                const Icon = KIND_ICONS[kind]
                return (
                  <ToggleGroupItem key={kind} value={kind} className="gap-1.5 aria-pressed:border-foreground aria-pressed:bg-foreground aria-pressed:text-background">
                    <Icon /> {KIND_SINGULAR[kind]}
                  </ToggleGroupItem>
                )
              })}
            </ToggleGroup>
            <div className="grid gap-2">
              <Label htmlFor="title">Internal name</Label>
              <Input id="title" value={draft.title} onChange={(event) => patch({ title: event.target.value })} placeholder={copy.orgPlaceholder || "How you'll recognise it in lists"} />
              <p className="text-xs text-muted-foreground">Only for you. Recruiters see the display fields below.</p>
            </div>
            {LOGO_KINDS.has(draft.kind) ? (
              <div className="grid gap-2">
                <span className="text-sm font-medium">{draft.kind === "education" ? "School logo" : draft.kind === "certification" ? "Issuer logo" : draft.kind === "project" ? "Project logo" : "Company logo"}</span>
                <LogoField value={draft.logoPath} name={draft.display.en.organization || draft.title || title} onChange={(logoPath) => patch({ logoPath })} />
              </div>
            ) : null}
          </Section>

          {/* 2. display */}
          <Section
            id="display"
            n={2}
            title="How it appears on a CV"
            description="Written once per language. Dates and names are copied as-is."
            action={
              <ToggleGroup value={[lang]} onValueChange={(value) => value[0] && setLang(value[0] as Lang)} variant="outline" size="sm" aria-label="Language">
                {LANGS.map((code) => (
                  <ToggleGroupItem key={code} value={code} className="gap-1.5 px-3 text-xs aria-pressed:border-foreground aria-pressed:bg-foreground aria-pressed:text-background">
                    {code.toUpperCase()}
                    {draft.display[code].role ? <span className="size-1.5 rounded-full bg-emerald-500" /> : <span className="size-1.5 rounded-full bg-muted-foreground/40" />}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            }
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <Field id={`${lang}-role`} label={copy.role} value={draft.display[lang].role} placeholder={copy.rolePlaceholder} onChange={(value) => patch({ display: { ...draft.display, [lang]: { ...draft.display[lang], role: value } } })} />
              <Field id={`${lang}-org`} label={copy.organization} value={draft.display[lang].organization} placeholder={copy.orgPlaceholder} onChange={(value) => patch({ display: { ...draft.display, [lang]: { ...draft.display[lang], organization: value } } })} />
              <Field id={`${lang}-dates`} label="Dates" value={draft.display[lang].dates} placeholder={lang === "en" ? "Feb. 2025 – Aug. 2025" : "Février 2025 – Août 2025"} onChange={(value) => patch({ display: { ...draft.display, [lang]: { ...draft.display[lang], dates: value } } })} />
              <Field id={`${lang}-location`} label="Location" value={draft.display[lang].location} placeholder={lang === "en" ? "Paris, France" : "Paris, France"} onChange={(value) => patch({ display: { ...draft.display, [lang]: { ...draft.display[lang], location: value } } })} />
            </div>
            {lang === "fr" && !draft.display.fr.role && draft.display.en.role ? (
              <Button variant="outline" size="sm" className="w-fit" onClick={() => patch({ display: { ...draft.display, fr: { ...draft.display.en } } })}>
                <CopyIcon /> Start from the English fields
              </Button>
            ) : null}
          </Section>

          {/* 3. facts */}
          <Section id="facts" n={3} title="Facts — what you can prove" description="One truth per line. These are the only statements generated text may rely on, and the only source of numbers.">
            <LineList
              numbered
              items={draft.facts.map((fact) => ({ key: fact.key, text: fact.statement }))}
              onChange={(items) => {
                const keys = new Set(items.map((item) => item.key))
                patch({
                  facts: items.map((item) => ({ key: item.key, statement: item.text })),
                  bullets: draft.bullets.map((bullet) => ({ ...bullet, factKeys: bullet.factKeys.filter((key) => keys.has(key)) })),
                })
              }}
              placeholder="e.g. Reduced execution time by 66%."
              addLabel="Add fact"
              onHover={setHoverFact}
              renderMeta={(key) =>
                usage[key] ? (
                  <span className="text-muted-foreground">
                    Backs {usage[key]} bullet{usage[key] === 1 ? "" : "s"}
                  </span>
                ) : draft.facts.find((fact) => fact.key === key)?.statement.trim() ? (
                  <span className="text-muted-foreground/70">Not used by any bullet yet</span>
                ) : null
              }
            />
            <p className="text-xs text-muted-foreground">
              <kbd className="rounded border px-1 font-mono">Enter</kbd> new fact · <kbd className="rounded border px-1 font-mono">Shift+Enter</kbd> line break · paste a list to split it
            </p>
          </Section>

          {/* 4. bullets */}
          <Section
            id="bullets"
            n={4}
            title="Bullets — approved wording"
            description="What may appear on a CV, side by side in both languages. Each bullet links to the facts that prove it."
            action={
              <Button variant="outline" size="sm" onClick={addGroup}>
                <PlusIcon /> Group
              </Button>
            }
          >
            {groups.length === 0 ? (
              <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed py-8 text-center">
                <p className="text-sm font-medium">No bullets yet</p>
                <p className="max-w-sm text-xs text-muted-foreground">Group bullets by theme (e.g. “Cloud”, “Monitoring”) so a CV can pick the ones that match a job.</p>
                <Button size="sm" onClick={addGroup}>
                  <PlusIcon /> Add first bullets
                </Button>
              </div>
            ) : null}
            {groups.map((group) => {
              const rows = pairRows(draft.bullets.filter((bullet) => bullet.group === group))
              return (
                <div key={group} className="grid gap-3 rounded-lg border bg-muted/20 p-3">
                  <div className="flex items-center gap-2">
                    <Input defaultValue={group} onBlur={(event) => event.target.value.trim() && event.target.value !== group && renameGroup(group, event.target.value.trim())} className="h-8 max-w-64 border-transparent bg-transparent font-medium shadow-none hover:border-input focus-visible:border-ring" aria-label="Group name" />
                    <span className="ml-auto hidden text-[11px] font-medium tracking-wide text-muted-foreground uppercase sm:inline">English</span>
                    <span className="hidden w-[calc(50%-0.5rem)] text-[11px] font-medium tracking-wide text-muted-foreground uppercase sm:inline">French</span>
                  </div>
                  {rows.map((row, index) => (
                    <div key={index} className="grid gap-3 sm:grid-cols-2">
                      {LANGS.map((code) =>
                        row[code] ? (
                          <BulletCard
                            key={row[code]!.key}
                            bullet={row[code]!}
                            facts={draft.facts}
                            check={grounding[row[code]!.key]}
                            highlighted={Boolean(hoverFact && row[code]!.factKeys.includes(hoverFact))}
                            onChange={(value) => updateBullet(row[code]!.key, value)}
                            onRemove={() => patch({ bullets: draft.bullets.filter((bullet) => bullet.key !== row[code]!.key) })}
                          />
                        ) : (
                          <button
                            key={code}
                            type="button"
                            onClick={() => {
                              const sibling = row[code === "en" ? "fr" : "en"]
                              patch({ bullets: [...draft.bullets, { key: newKey(), group, role: sibling?.role ?? "bullet", language: code, text: "", factKeys: sibling?.factKeys ?? [] }] })
                            }}
                            className="flex min-h-24 items-center justify-center gap-1.5 rounded-lg border border-dashed text-xs text-muted-foreground transition-colors hover:border-ring hover:text-foreground"
                          >
                            <PlusIcon className="size-3.5" /> Add {code === "en" ? "English" : "French"} version
                          </button>
                        ),
                      )}
                    </div>
                  ))}
                  <div className="flex gap-2">
                    <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => patch({ bullets: [...draft.bullets, ...LANGS.map((language) => ({ key: newKey(), group, role: "bullet" as const, language, text: "", factKeys: [] }))] })}>
                      <PlusIcon /> Add bullet pair
                    </Button>
                    {rows.length === 0 ? (
                      <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => addBullet(group, "en")}>
                        <PlusIcon /> English only
                      </Button>
                    ) : null}
                  </div>
                </div>
              )
            })}
          </Section>

          {/* 5. guardrails */}
          <Section id="guardrails" n={5} title="Guardrails" description="Hard limits sent with every generation request.">
            <div className="grid gap-2">
              <Label>Never claim</Label>
              <StringLineList values={draft.doNotClaim} onChange={(doNotClaim) => patch({ doNotClaim })} placeholder="e.g. Do not claim ownership of all cloud security." addLabel="Add rule" />
            </div>
            <label className="flex items-start justify-between gap-4 rounded-lg border p-3">
              <span className="grid gap-0.5">
                <span className="flex items-center gap-1.5 text-sm font-medium">
                  <LockIcon className="size-3.5" /> Under NDA
                </span>
                <span className="text-xs text-muted-foreground">Generated text stays high-level: no clients, datasets, internal architecture or confidential metrics.</span>
              </span>
              <Switch checked={draft.confidential} onCheckedChange={(value) => patch({ confidential: value })} />
            </label>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label>Tags</Label>
                <ChipInput values={draft.tags} onChange={(tags) => patch({ tags })} placeholder="devsecops, cloud…" />
                <p className="text-xs text-muted-foreground">Matched against job requirements.</p>
              </div>
              <div className="grid gap-2">
                <Label>Skills proven here</Label>
                <ChipInput values={draft.skills} onChange={(skills) => patch({ skills })} placeholder="Terraform, Go…" />
              </div>
            </div>
            <div className="grid gap-2">
              <Label>Evidence</Label>
              <StringLineList values={draft.evidence} onChange={(evidence) => patch({ evidence })} placeholder="Link, document or reference" addLabel="Add evidence" />
            </div>
          </Section>
        </div>

        {/* aside */}
        <aside className="grid content-start gap-4 xl:sticky xl:top-20 xl:max-h-[calc(100svh-6rem)] xl:overflow-y-auto">
          <Card size="sm">
            <CardHeader>
              <CardTitle className="flex items-center justify-between text-sm">
                Readiness
                <Badge variant={ready === readiness.length ? "default" : "secondary"} className="tabular-nums">
                  {ready}/{readiness.length}
                </Badge>
              </CardTitle>
              <CardDescription>Verified entries with backed bullets are used for generation.</CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="grid gap-0.5">
                {readiness.map((item) => (
                  <li key={item.label}>
                    <button type="button" onClick={() => jump(item.section)} className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted">
                      {item.done ? <CheckCircle2Icon className="size-4 text-emerald-500" /> : item.section === "bullets" ? <AlertTriangleIcon className="size-4 text-amber-500" /> : <CircleDashedIcon className="size-4 text-muted-foreground" />}
                      <span className={cn(item.done && "text-muted-foreground")}>{item.label}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          <Card size="sm">
            <CardHeader>
              <CardTitle className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-1.5">
                  <BookOpenIcon className="size-4" /> CV preview
                </span>
                <ToggleGroup value={[previewLang]} onValueChange={(value) => value[0] && setPreviewLang(value[0] as Lang)} variant="outline" size="sm">
                  {LANGS.map((code) => (
                    <ToggleGroupItem key={code} value={code} className="h-6 px-2 text-[11px]">
                      {code.toUpperCase()}
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Preview draft={draft} lang={previewLang} grounding={grounding} />
            </CardContent>
          </Card>

          <nav className="hidden gap-0.5 xl:grid" aria-label="Sections">
            {SECTIONS.map((section, index) => (
              <button key={section.id} type="button" onClick={() => jump(section.id)} className="rounded-md px-2 py-1 text-left text-xs text-muted-foreground hover:bg-muted hover:text-foreground">
                {index + 1}. {section.label}
              </button>
            ))}
          </nav>
        </aside>
      </div>

      <AlertDialog open={confirmLeave !== null} onOpenChange={(open) => !open && setConfirmLeave(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Leave with unsaved changes?</AlertDialogTitle>
            <AlertDialogDescription>Your edits to this entry will be lost.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep editing</AlertDialogCancel>
            <Button variant="outline" onClick={() => confirmLeave && router.push(confirmLeave)}>
              Discard
            </Button>
            <AlertDialogAction onClick={() => confirmLeave && save(confirmLeave)}>Save and leave</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{title}”?</AlertDialogTitle>
            <AlertDialogDescription>Its facts and bullets are removed too. Archiving keeps them but excludes the entry from generation.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <Button variant="outline" onClick={() => (setConfirmDelete(false), patch({ status: "archived" }))}>
              Archive instead
            </Button>
            <AlertDialogAction variant="destructive" onClick={remove}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function Section({ id, n, title, description, action, children }: { id: string; n: number; title: string; description: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-20">
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div className="flex gap-3">
            <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold tabular-nums">{n}</span>
            <div className="grid gap-1">
              <CardTitle>{title}</CardTitle>
              <CardDescription>{description}</CardDescription>
            </div>
          </div>
          {action}
        </CardHeader>
        <CardContent className="grid gap-4">{children}</CardContent>
      </Card>
    </section>
  )
}

function Field({ id, label, value, placeholder, onChange }: { id: string; label: string; value: string; placeholder?: string; onChange: (value: string) => void }) {
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} />
    </div>
  )
}

function BulletCard({
  bullet,
  facts,
  check,
  highlighted,
  onChange,
  onRemove,
}: {
  bullet: DraftBullet
  facts: { key: string; statement: string }[]
  check?: ReturnType<typeof verifySupport>
  highlighted: boolean
  onChange: (value: Partial<DraftBullet>) => void
  onRemove: () => void
}) {
  const linked = facts.filter((fact) => bullet.factKeys.includes(fact.key))
  const isLabel = bullet.role === "label"
  const empty = !bullet.text.trim()
  return (
    <div
      className={cn(
        "group grid content-start gap-2 rounded-lg border bg-background p-2.5 transition-shadow",
        highlighted && "ring-2 ring-primary/40",
        !isLabel && !empty && !check?.grounded && "border-amber-300 dark:border-amber-700",
      )}
    >
      <div className="flex items-start gap-1.5">
        <Badge variant="outline" className="mt-2 shrink-0 font-mono text-[10px] uppercase">
          {bullet.language}
        </Badge>
        <GrowText value={bullet.text} onChange={(event) => onChange({ text: event.target.value })} placeholder={isLabel ? "Section label" : "Approved bullet wording…"} className="border-transparent shadow-none hover:border-input" />
        <Button size="icon-sm" variant="ghost" className="mt-1 opacity-0 group-hover:opacity-100 focus-visible:opacity-100" aria-label="Remove bullet" onClick={onRemove}>
          <XIcon />
        </Button>
      </div>
      {isLabel ? (
        <p className="pl-1 text-xs text-muted-foreground">Label — a heading, not a claim.</p>
      ) : (
        <div className="grid gap-1.5 pl-1">
          {linked.length ? (
            <ul className="grid gap-1">
              {linked.map((fact) => (
                <li key={fact.key} className="flex items-start gap-1.5 rounded-md bg-muted/60 px-2 py-1 text-xs text-muted-foreground">
                  <CheckCircle2Icon className="mt-0.5 size-3 shrink-0 text-emerald-600" />
                  <span className="min-w-0 flex-1">{fact.statement}</span>
                  <button type="button" aria-label="Unlink fact" className="opacity-50 hover:opacity-100" onClick={() => onChange({ factKeys: bullet.factKeys.filter((key) => key !== fact.key) })}>
                    <XIcon className="size-3" />
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          <div className="flex flex-wrap items-center gap-2 text-xs">
            {!empty && !check?.grounded ? (
              <span className="inline-flex items-center gap-1 text-amber-600">
                <AlertTriangleIcon className="size-3.5" />
                {check?.unsupportedNumbers.length ? `No fact backs ${check.unsupportedNumbers.join(", ")}` : "Link a fact that proves this"}
              </span>
            ) : null}
            <FactPicker facts={facts} selected={bullet.factKeys} onChange={(factKeys) => onChange({ factKeys })} />
          </div>
        </div>
      )}
    </div>
  )
}

function Preview({ draft, lang, grounding }: { draft: Draft; lang: Lang; grounding: Record<string, ReturnType<typeof verifySupport>> }) {
  const display = draft.display[lang]
  const bullets = draft.bullets.filter((bullet) => bullet.language === lang && bullet.role === "bullet" && bullet.text.trim())
  if (!display.role && !bullets.length) {
    return <p className="text-xs text-muted-foreground">Fill in the {lang === "en" ? "English" : "French"} display fields to see this entry as it will appear on a CV.</p>
  }
  return (
    <div className="grid gap-2 rounded-md border bg-white p-3 text-[12.5px] leading-snug text-zinc-900 shadow-sm dark:bg-zinc-50">
      <div className="flex items-start gap-2.5">
        {draft.logoPath ? <EntryLogo path={draft.logoPath} name={display.organization || draft.title} size={30} className="border-zinc-200 bg-white" /> : null}
        <div className="grid min-w-0 flex-1 gap-0.5">
          <div className="flex items-baseline justify-between gap-2">
            <span className="font-semibold">{display.role || "—"}</span>
            <span className="shrink-0 text-[11px] text-zinc-500">{display.dates}</span>
          </div>
          {display.organization || display.location ? (
            <div className="flex justify-between gap-2 text-[11px] text-zinc-600 italic">
              <span>{display.organization}</span>
              <span>{display.location}</span>
            </div>
          ) : null}
        </div>
      </div>
      {bullets.length ? (
        <ul className="grid list-disc gap-1 pl-4">
          {bullets.map((bullet) => (
            <li key={bullet.key} className={cn(!grounding[bullet.key]?.grounded && "decoration-amber-500 decoration-wavy underline-offset-2 [text-decoration-line:underline]")}>
              {bullet.text.replace(/\*\*(.+?)\*\*/g, "$1")}
            </li>
          ))}
        </ul>
      ) : null}
      {bullets.some((bullet) => !grounding[bullet.key]?.grounded) ? <p className="text-[10.5px] text-amber-700">Wavy underline: not backed by a fact yet; generation will skip it.</p> : null}
    </div>
  )
}
