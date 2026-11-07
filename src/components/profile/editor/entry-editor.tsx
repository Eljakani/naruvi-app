"use client"

import { PresenceItem, PresenceList } from "@/components/presence"
import { useRouter } from "next/navigation"
import { useCallback, useEffect, useMemo, useState, useTransition } from "react"
import { AnimatePresence, LayoutGroup, motion, useReducedMotion } from "motion/react"
import {
  ChevronDownIcon,
  CheckIcon,
  ArchiveIcon,
  ShieldCheckIcon,
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
import { BulletSuggestions } from "@/components/profile/editor/bullet-suggestions"
import { EntryAssist } from "@/components/profile/editor/entry-assist"
import { ChipInput, FactPicker, GrowText, LineList, StringLineList } from "@/components/profile/editor/inputs"
import { LanguageSwitch, LANGUAGE_NAMES } from "@/components/profile/language-switch"
import ParticleButton from "@/components/kokonutui/particle-button"
import { Otter } from "@/components/naruvi/otter"
import { DateRangeField } from "@/components/profile/editor/date-range-field"
import { Segmented } from "@/components/ui/segmented"
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
import { Field as UiField, FieldContent, FieldDescription, FieldGroup, FieldLabel, FieldSeparator } from "@/components/ui/field"
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
  experience: { role: "Role", organization: "Company", rolePlaceholder: "Store Manager", orgPlaceholder: "Company name" },
  project: { role: "Project name", organization: "Context", rolePlaceholder: "Community garden app", orgPlaceholder: "Personal project" },
  education: { role: "Degree", organization: "School", rolePlaceholder: "BSc Nursing", orgPlaceholder: "University name" },
  certification: { role: "Certification", organization: "Issuer", rolePlaceholder: "KCNA", orgPlaceholder: "Linux Foundation" },
  skill: { role: "Cluster label", organization: "Context", rolePlaceholder: "Customer service", orgPlaceholder: "" },
  language: { role: "Label", organization: "Context", rolePlaceholder: "Languages", orgPlaceholder: "" },
  achievement: { role: "Title", organization: "Event / issuer", rolePlaceholder: "1st place", orgPlaceholder: "WOCS'hAck 2026" },
  other: { role: "Title", organization: "Organization", rolePlaceholder: "", orgPlaceholder: "" },
}

const LOGO_KINDS = new Set<Draft["kind"]>(["experience", "education", "project", "certification", "achievement"])

const SECTIONS = [
  { id: "basics", label: "Basics" },
  { id: "display", label: "How it appears" },
  { id: "facts", label: "What you did" },
  { id: "bullets", label: "CV lines" },
  { id: "skills", label: "Skills & keywords" },
  { id: "guardrails", label: "Never say" },
] as const

export function EntryEditor({ entry, initialKind }: { entry: ProfileEntry | null; initialKind?: Draft["kind"] }) {
  const router = useRouter()
  const [initial] = useState(() => ({ ...toDraft(entry), ...(entry || !initialKind ? {} : { kind: initialKind }) }))
  const [draft, setDraft] = useState<Draft>(initial)
  const [lang, setLang] = useState<Lang>("en")
  const [hoverFact, setHoverFact] = useState<string | null>(null)
  const [confirmLeave, setConfirmLeave] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [pending, startTransition] = useTransition()

  const [saveStatus, setSaveStatus] = useState<"idle" | "pending" | "success">("idle")
  const [wasPending, setWasPending] = useState(false)
  if (pending !== wasPending) {
    setWasPending(pending)
    setSaveStatus(pending ? "pending" : "success")
  }
  useEffect(() => {
    if (saveStatus !== "success") return
    const timer = setTimeout(() => setSaveStatus("idle"), 1400)
    return () => clearTimeout(timer)
  }, [saveStatus])
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
    { label: "English title & dates", done: Boolean(draft.display.en.role), section: "display" },
    { label: "French title & dates", done: Boolean(draft.display.fr.role), section: "display" },
    { label: draft.kind === "skill" ? "Skills listed" : "At least one fact", done: draft.kind === "skill" ? draft.skills.length > 0 : facts.length > 0, section: draft.kind === "skill" ? "skills" : "facts" },
    { label: ungrounded.length ? `${ungrounded.length} CV line${ungrounded.length === 1 ? "" : "s"} without a fact` : "Every CV line has a fact", done: ungrounded.length === 0, section: "bullets" },
    { label: "Checked by you", done: draft.status === "verified", section: "basics" },
  ]

  /* ---------- save / delete / leave ---------- */
  const save = useCallback(
    (then?: string) =>
      startTransition(async () => {
        const result = await saveEntryAction(toInput(draft), entry?.id)
        if (!result.ok) return void toast.error("Could not save", { description: result.error })
        toast.success(entry ? "Saved" : "Entry created", {
          description: ungrounded.length ? `${ungrounded.length} CV line(s) still need a fact behind them.` : "Every CV line is backed by a fact.",
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
      <div className="sticky top-0 z-20 flex flex-wrap items-center gap-x-3 gap-y-2 border-b bg-background/85 px-4 py-2.5 backdrop-blur md:px-6">
        <Button variant="ghost" size="icon-sm" onClick={() => leave("/profile")} aria-label="Back to profile" title="Back to profile">
          <ArrowLeftIcon />
        </Button>
        {LOGO_KINDS.has(draft.kind) ? <EntryLogo path={draft.logoPath} name={draft.display.en.organization || title} size={36} className="rounded-lg" /> : null}
        <div className="min-w-48 flex-1 basis-64">
          <div className="truncate font-semibold" title={title}>{title}</div>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span>{KIND_SINGULAR[draft.kind]}</span>
            <span aria-hidden>·</span>
            <AnimatePresence mode="wait" initial={false}>
              <motion.span
                key={dirty ? "dirty" : pending ? "saving" : "saved"}
                initial={{ opacity: 0, y: 3 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -3 }}
                transition={{ duration: 0.15 }}
                className={cn("inline-flex items-center gap-1", dirty && "text-amber-600 dark:text-amber-400")}
              >
                {dirty ? <span className="size-1.5 rounded-full bg-amber-500" aria-hidden /> : entry ? <CheckIcon className="size-3 text-emerald-600" aria-hidden /> : null}
                {dirty ? "Unsaved changes" : entry ? "All changes saved" : "Not saved yet"}
              </motion.span>
            </AnimatePresence>
          </div>
        </div>
        <div className="ms-auto flex flex-wrap items-center gap-2">
          <LanguageSwitch value={lang} onChange={setLang} languages={LANGS} filled={(code) => Boolean(draft.display[code].role.trim())} label="Language you're writing in" />
          <span className="hidden h-5 w-px bg-border sm:block" aria-hidden />
          <Segmented
            value={draft.status}
            onChange={(status) => patch({ status })}
            label="Status"
            options={entryStatuses.map((status) => ({
              value: status,
              label: (
                <>
                  {status === "verified" ? <ShieldCheckIcon /> : status === "needs_review" ? <CircleDashedIcon /> : <ArchiveIcon />}
                  {STATUS_LABELS[status]}
                </>
              ),
              ...(status === "verified"
                ? { thumbClassName: "bg-emerald-50 ring-1 ring-emerald-200 dark:bg-emerald-950/60 dark:ring-emerald-900", activeClassName: "text-emerald-700 dark:text-emerald-400" }
                : status === "needs_review"
                  ? { thumbClassName: "bg-amber-50 ring-1 ring-amber-200 dark:bg-amber-950/60 dark:ring-amber-900", activeClassName: "text-amber-700 dark:text-amber-400" }
                  : {}),
            }))}
          />
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
          <ParticleButton
            size="sm"
            status={saveStatus}
            onClick={() => save()}
            disabled={!pending && !dirty && Boolean(entry)}
            pendingLabel="Saving"
            successLabel="Saved"
            className="min-w-20"
          >
            {entry ? "Save" : "Create entry"}
            <kbd className="ms-1 hidden rounded bg-primary-foreground/15 px-1 font-mono text-[10px] sm:inline">⌘S</kbd>
          </ParticleButton>
        </div>
      </div>

      <div className="grid gap-6 p-4 md:p-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="grid min-w-0 gap-6">
          {/* 1. basics */}
          <EntryAssist draft={draft} patch={patch} />
          <Section id="basics" n={1} title="What is it?" description="The fields below adapt to the type.">
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
            description={`Title, place and dates in ${LANGUAGE_NAMES[lang]}. Switch language at the top.`}
          >
            <div key={lang} className="cb-fade grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Field id={`${lang}-role`} label={copy.role} value={draft.display[lang].role} placeholder={copy.rolePlaceholder} onChange={(value) => patch({ display: { ...draft.display, [lang]: { ...draft.display[lang], role: value } } })} />
              </div>
              <Field id={`${lang}-org`} label={copy.organization} value={draft.display[lang].organization} placeholder={copy.orgPlaceholder} onChange={(value) => patch({ display: { ...draft.display, [lang]: { ...draft.display[lang], organization: value } } })} />
              <Field id={`${lang}-location`} label="Location" value={draft.display[lang].location} placeholder={lang === "en" ? "Paris, France" : "Paris, France"} onChange={(value) => patch({ display: { ...draft.display, [lang]: { ...draft.display[lang], location: value } } })} />
              <div className="sm:col-span-2">
                <DateRangeField
                  key={lang}
                  id={`${lang}-dates`}
                  lang={lang}
                  value={draft.display[lang].dates}
                  onChange={(text) => patch({ display: { en: { ...draft.display.en, dates: text.en ?? draft.display.en.dates }, fr: { ...draft.display.fr, dates: text.fr ?? draft.display.fr.dates } } })}
                />
              </div>
            </div>
            {(() => {
              const other = LANGS.find((code) => code !== lang)!
              return !draft.display[lang].role && draft.display[other].role ? (
                <Button variant="outline" size="sm" className="w-fit" onClick={() => patch({ display: { ...draft.display, [lang]: { ...draft.display[other] } } })}>
                  <CopyIcon /> Start from the {LANGUAGE_NAMES[other]} fields
                </Button>
              ) : null
            })()}
          </Section>

          {/* 3. facts */}
          <Section id="facts" n={3} title="What you did" description="One fact per line, in plain words, with numbers when you have them. CVs and letters can only say what is written here.">
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
              placeholder="e.g. Cut average response time from 2 days to 4 hours."
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
            title="CV lines"
            description={`The polished sentences a CV may use, shown in ${LANGUAGE_NAMES[lang]}. Each one points to the facts that back it up.`}
            action={
              <Button variant="outline" size="sm" onClick={addGroup}>
                <PlusIcon /> Group
              </Button>
            }
          >
            <BulletSuggestions
              input={{
                kind: draft.kind,
                role: draft.display.en.role || draft.display.fr.role || draft.title,
                organization: draft.display.en.organization || draft.display.fr.organization,
                facts: draft.facts.filter((fact) => fact.statement.trim()).map((fact) => ({ key: fact.key, statement: fact.statement })),
                existing: draft.bullets.map((bullet) => bullet.text).filter(Boolean),
                languages: [...LANGS],
              }}
              onAdd={(suggestion) =>
                patch({ bullets: [...draft.bullets, { key: newKey(), group: groups[0] ?? "Suggested", role: "bullet", language: suggestion.language as Lang, text: suggestion.text, factKeys: suggestion.factKeys }] })
              }
            />
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
                    <span className="ml-auto text-[11px] font-medium tracking-wide text-muted-foreground uppercase">{LANGUAGE_NAMES[lang]}</span>
                  </div>
                  <div key={lang} className="cb-fade grid gap-3">
                    <PresenceList>
                    {rows.map((row, index) => {
                      const bullet = row[lang]
                      const sibling = row[lang === "en" ? "fr" : "en"]
                      return (
                        <PresenceItem key={bullet?.key ?? sibling?.key ?? `missing-${index}`}>
                        {bullet ? (
                        <BulletCard
                          bullet={bullet}
                          facts={draft.facts}
                          check={grounding[bullet.key]}
                          highlighted={Boolean(hoverFact && bullet.factKeys.includes(hoverFact))}
                          onChange={(value) => updateBullet(bullet.key, value)}
                          onRemove={() => patch({ bullets: draft.bullets.filter((item) => item.key !== bullet.key) })}
                        />
                      ) : (
                        <button
                          type="button"
                          onClick={() => patch({ bullets: [...draft.bullets, { key: newKey(), group, role: sibling?.role ?? "bullet", language: lang, text: "", factKeys: sibling?.factKeys ?? [] }] })}
                          className="grid gap-1 rounded-lg border border-dashed p-3 text-left text-xs text-muted-foreground transition-colors hover:border-ring hover:text-foreground"
                        >
                          <span className="flex items-center gap-1.5 font-medium"><PlusIcon className="size-3.5" /> Add the {LANGUAGE_NAMES[lang]} version</span>
                          {sibling?.text ? <span className="line-clamp-2">{sibling.text}</span> : null}
                        </button>
                        )}
                        </PresenceItem>
                      )
                    })}
                    </PresenceList>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => patch({ bullets: [...draft.bullets, ...LANGS.map((language) => ({ key: newKey(), group, role: "bullet" as const, language, text: "", factKeys: [] }))] })}>
                      <PlusIcon /> Add bullet
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
          <Section id="skills" n={5} title="Skills & keywords" description="Helps match this entry to the right jobs.">
            <FieldGroup>
              <UiField>
                <FieldLabel>Skills used here</FieldLabel>
                <ChipInput values={draft.skills} onChange={(skills) => patch({ skills })} placeholder="Type a skill, press Enter" />
                <FieldDescription>Tools and abilities this entry proves, e.g. Terraform, triage, negotiation.</FieldDescription>
              </UiField>
              <UiField>
                <FieldLabel>Keywords</FieldLabel>
                <ChipInput values={draft.tags} onChange={(tags) => patch({ tags })} placeholder="Type a keyword, press Enter" />
                <FieldDescription>Topics and fields it relates to, e.g. fintech, appsec. Used only for matching, never printed.</FieldDescription>
              </UiField>
              <UiField>
                <FieldLabel>Proof</FieldLabel>
                <StringLineList values={draft.evidence} onChange={(evidence) => patch({ evidence })} placeholder="https://… or the name of a document" addLabel="Add a link or document" />
                <FieldDescription>Optional. Links or documents that back this up, for your own reference.</FieldDescription>
              </UiField>
            </FieldGroup>
          </Section>

          <Section id="guardrails" n={6} title="Never say" description="Limits for CVs and letters about this entry.">
            <FieldGroup>
              <UiField>
                <FieldLabel>Things not to claim</FieldLabel>
                <StringLineList values={draft.doNotClaim} onChange={(doNotClaim) => patch({ doNotClaim })} placeholder="e.g. Don’t present this freelance work as a permanent job." addLabel="Add a rule" />
              </UiField>
              <FieldSeparator />
              <UiField orientation="horizontal">
                <FieldContent>
                  <FieldLabel htmlFor="entry-nda" className="flex items-center gap-1.5">
                    <LockIcon className="size-3.5" /> Under NDA
                  </FieldLabel>
                  <FieldDescription>Keep it high-level: no client names, internal systems or confidential numbers.</FieldDescription>
                </FieldContent>
                <Switch id="entry-nda" checked={draft.confidential} onCheckedChange={(value) => patch({ confidential: value })} />
              </UiField>
            </FieldGroup>
          </Section>
        </div>

        {/* aside */}
        <aside className="grid content-start gap-4 xl:sticky xl:top-20 xl:max-h-[calc(100svh-6rem)] xl:overflow-y-auto xl:[scrollbar-width:none]">
          <Readiness items={readiness} onJump={jump} />
          <PreviewCard draft={draft} lang={lang} onLang={setLang} grounding={grounding} />
          <SectionIndex sections={SECTIONS} incomplete={new Set(readiness.filter((item) => !item.done).map((item) => item.section))} onJump={jump} />
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
        <Badge variant="outline" className="mt-2 shrink-0 font-mono text-[11px] uppercase">
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

/* ---------------------------------- aside ---------------------------------- */

const EASE = [0.23, 1, 0.32, 1] as const
type Check = { label: string; done: boolean; section: string }

function ProgressRing({ value, total }: { value: number; total: number }) {
  const reduce = useReducedMotion()
  const r = 15
  const c = 2 * Math.PI * r
  const complete = value === total
  return (
    <div className="relative size-10 shrink-0">
      <svg viewBox="0 0 36 36" className="size-full -rotate-90">
        <circle cx="18" cy="18" r={r} className="fill-none stroke-muted" strokeWidth="3.5" />
        <motion.circle
          cx="18" cy="18" r={r} strokeWidth="3.5" strokeLinecap="round" strokeDasharray={c}
          className={cn("fill-none", complete ? "stroke-emerald-500" : "stroke-amber-500")}
          initial={reduce ? false : { strokeDashoffset: c }}
          animate={{ strokeDashoffset: c * (1 - value / total) }}
          transition={{ duration: 0.6, ease: EASE }}
        />
      </svg>
      <span className="absolute inset-0 grid place-content-center">
        {complete ? <CheckCircle2Icon className="size-4 text-emerald-500" /> : <span className="text-[11px] font-semibold tabular-nums">{value}/{total}</span>}
      </span>
    </div>
  )
}

/** All good: one calm line. Something missing: the missing steps first, each a shortcut to its section. */
function Readiness({ items, onJump }: { items: Check[]; onJump: (id: string) => void }) {
  const done = items.filter((item) => item.done).length
  const complete = done === items.length
  const [open, setOpen] = useState(!complete)
  const todo = items.filter((item) => !item.done)
  const finished = items.filter((item) => item.done)
  return (
    <Card size="sm" className={cn("gap-0 overflow-hidden transition-colors", complete && "border-emerald-200/70 bg-gradient-to-b from-emerald-50/60 to-transparent dark:border-emerald-900/50 dark:from-emerald-950/20")}>
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="flex w-full items-center gap-3 px-4 py-1 text-start">
        {complete ? <Otter pose="all-checked" height={44} className="-my-1" /> : <ProgressRing value={done} total={items.length} />}
        <span className="grid min-w-0 flex-1 gap-0.5">
          <span className="text-sm font-medium">{complete ? "Ready for CVs" : `${items.length - done} step${items.length - done === 1 ? "" : "s"} before CVs can use it`}</span>
          <span className="text-xs text-muted-foreground">{complete ? `All ${items.length} checks pass` : "CVs and letters skip it until then"}</span>
        </span>
        <ChevronDownIcon className={cn("size-4 shrink-0 text-muted-foreground transition-transform duration-200", open && "rotate-180")} />
      </button>
      <AnimatePresence initial={false}>
        {open ? (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.22, ease: EASE }} className="overflow-hidden">
            <ul className="grid gap-0.5 px-2 pt-2 pb-1">
              {[...todo, ...finished].map((item) => (
                <li key={item.label}>
                  <button type="button" onClick={() => onJump(item.section)} className={cn("group flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-start text-sm transition-colors hover:bg-muted", !item.done && "bg-amber-50/70 dark:bg-amber-950/20")}>
                    {item.done ? <CheckCircle2Icon className="size-4 shrink-0 text-emerald-500" /> : item.section === "bullets" ? <AlertTriangleIcon className="size-4 shrink-0 text-amber-500" /> : <CircleDashedIcon className="size-4 shrink-0 text-amber-500" />}
                    <span className={cn("min-w-0 flex-1", item.done ? "text-muted-foreground" : "font-medium")}>{item.label}</span>
                    {!item.done ? <span className="text-[11px] text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100">Fix</span> : null}
                  </button>
                </li>
              ))}
            </ul>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </Card>
  )
}

function PreviewCard({ draft, lang, onLang, grounding }: { draft: Draft; lang: Lang; onLang: (lang: Lang) => void; grounding: Record<string, ReturnType<typeof verifySupport>> }) {
  return (
    <Card size="sm" className="gap-3">
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle className="flex items-center gap-1.5 text-sm">
          <BookOpenIcon className="size-4" /> On your CV
        </CardTitle>
        <LayoutGroup id="preview-lang">
          <div role="tablist" aria-label="Preview language" className="flex rounded-md bg-muted p-0.5">
            {(["en", "fr"] as const).map((code) => (
              <button key={code} role="tab" type="button" aria-selected={lang === code} onClick={() => onLang(code)} className={cn("relative rounded px-2 py-0.5 text-[11px] font-medium uppercase transition-colors", lang === code ? "text-foreground" : "text-muted-foreground hover:text-foreground")}>
                {lang === code ? <motion.span layoutId="preview-lang-pill" className="absolute inset-0 rounded bg-background shadow-xs" transition={{ type: "spring", duration: 0.3, bounce: 0.15 }} /> : null}
                <span className="relative">{code}</span>
              </button>
            ))}
          </div>
        </LayoutGroup>
      </CardHeader>
      <CardContent>
        <div className="rounded-lg bg-muted/50 p-2">
          <div key={lang} className="cb-fade"><Preview draft={draft} lang={lang} grounding={grounding} /></div>
        </div>
      </CardContent>
    </Card>
  )
}

/** "On this page": follows your scroll, with a dot on sections that still need something. */
function SectionIndex({ sections, incomplete, onJump }: { sections: readonly { id: string; label: string }[]; incomplete: Set<string>; onJump: (id: string) => void }) {
  const [active, setActive] = useState<string>(sections[0]?.id ?? "")
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((entry) => entry.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0]
        if (visible) setActive(visible.target.id)
      },
      { rootMargin: "-80px 0px -55% 0px" },
    )
    for (const section of sections) {
      const element = document.getElementById(section.id)
      if (element) observer.observe(element)
    }
    return () => observer.disconnect()
  }, [sections])
  return (
    <nav className="hidden xl:grid" aria-label="Sections">
      <p className="mb-1.5 px-3 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">On this page</p>
      <LayoutGroup id="entry-sections">
        <ol className="relative grid border-s">
          {sections.map((section, index) => (
            <li key={section.id} className="relative">
              {active === section.id ? <motion.span layoutId="entry-section-marker" className="absolute inset-y-1 -start-px w-0.5 rounded-full bg-foreground" transition={{ type: "spring", duration: 0.35, bounce: 0.1 }} /> : null}
              <button
                type="button"
                onClick={() => onJump(section.id)}
                aria-current={active === section.id ? "location" : undefined}
                className={cn("flex w-full items-center gap-2 px-3 py-1 text-start text-xs transition-colors", active === section.id ? "font-medium text-foreground" : "text-muted-foreground hover:text-foreground")}
              >
                <span className="w-3 text-muted-foreground tabular-nums">{index + 1}</span>
                <span className="min-w-0 flex-1 truncate">{section.label}</span>
                {incomplete.has(section.id) ? <span className="size-1.5 rounded-full bg-amber-500" aria-label="Needs something" /> : null}
              </button>
            </li>
          ))}
        </ol>
      </LayoutGroup>
    </nav>
  )
}
