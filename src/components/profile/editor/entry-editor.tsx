"use client"

import UndoButton from "@/components/kokonutui/undo-button"
import { Presence, PresenceItem, PresenceList } from "@/components/presence"
import { useRouter } from "next/navigation"
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react"
import { AnimatePresence, LayoutGroup, motion, useReducedMotion } from "motion/react"
import {
  ChevronDownIcon,
  CheckIcon,
  ArchiveIcon,
  ShieldCheckIcon,
  SparklesIcon,
  AlertTriangleIcon,
  ArrowLeftIcon,
  AwardIcon,
  BookOpenIcon,
  BriefcaseBusinessIcon,
  CheckCircle2Icon,
  CircleDashedIcon,
  CopyIcon,
  CornerDownRightIcon,
  FolderGit2Icon,
  GraduationCapIcon,
  LanguagesIcon,
  LightbulbIcon,
  MoreHorizontalIcon,
  PlusIcon,
  ShapesIcon,
  TrashIcon,
  TrophyIcon,
  WrenchIcon,
  XIcon,
} from "lucide-react"
import { toast } from "sonner"
import { deleteEntryAction, entryTranslationAction, saveEntryAction } from "@/app/[locale]/(app)/profile/actions"
import { EntryLogo } from "@/components/profile/entry-logo"
import { LogoField } from "@/components/profile/editor/logo-field"
import { BulletSuggestions } from "@/components/profile/editor/bullet-suggestions"
import { EntryAssist } from "@/components/profile/editor/entry-assist"
import { FactPicker, GrowText, LineList, QUIET } from "@/components/profile/editor/inputs"
import { AskExtrasButton, GuardrailFields, SkillFields, useExtras } from "@/components/profile/editor/entry-extras"
import { LanguageSwitch } from "@/components/profile/language-switch"
import ParticleButton from "@/components/kokonutui/particle-button"
import { Otter } from "@/components/naruvi/otter"
import { AutoBadge, KindFields } from "@/components/profile/editor/kind-fields"
import { describeEntry, entryView, hasHeading, KIND_FIELDS } from "@/lib/entry-fields"
import { Segmented } from "@/components/ui/segmented"
import { type Draft, type DraftBullet, type Lang, LANGS, newKey, pairRows, toDraft, toInput } from "@/components/profile/editor/draft"

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
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { cn } from "@/lib/utils"
import { verifySupport } from "@/server/domain/grounding"
import type { ProfileEntry } from "@/server/profile/repository"
import { entryKinds, entryStatuses } from "@/server/profile/schemas"
import { useLocale, useTranslations } from "next-intl"
import { languageName } from "@/i18n/config"

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

const LOGO_KINDS = new Set<Draft["kind"]>(["experience", "education", "project", "certification", "achievement"])

const SECTIONS = ["basics", "display", "facts", "bullets", "skills", "guardrails"] as const

export function EntryEditor({ entry, initialKind }: { entry: ProfileEntry | null; initialKind?: Draft["kind"] }) {
  const t = useTranslations("entryEditor")
  const tp = useTranslations("profileLabels")
  const locale = useLocale()
  const router = useRouter()
  const [initial, setInitial] = useState(() => ({ ...toDraft(entry), ...(entry || !initialKind ? {} : { kind: initialKind }) }))
  const [draft, setDraft] = useState<Draft>(initial)
  // Open on the language that holds data (e.g. a French CV import fills only `fr`), so imported fields are visible.
  const [lang, setLang] = useState<Lang>(() => (LANGS as readonly Lang[]).find((code) => Object.values(initial.display[code]).some((value) => String(value).trim())) ?? "en")
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
  const dirtyRef = useRef(dirty)
  useEffect(() => {
    dirtyRef.current = dirty
  }, [dirty])
  const [translating, setTranslating] = useState(false)
  /** A save queues a translation into the other CV language: show it as soon as it lands. */
  const showTranslation = useCallback(async (pending: ReturnType<typeof entryTranslationAction>) => {
    const result = await pending
    if (!result.ok || !result.data) return
    if (dirtyRef.current) return void toast(t("translation.readyLater"))
    const next = toDraft(result.data)
    setInitial(next)
    setDraft(next)
    toast.success(t("translation.ready"))
  }, [t])
  const followTranslation = useCallback((id: string) => {
    setTranslating(true)
    return showTranslation(entryTranslationAction(id)).finally(() => setTranslating(false))
  }, [showTranslation])

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
  // A name written per language must exist in each CV language; a shared one (company, project name) once.
  const translatedName = KIND_FIELDS[draft.kind].find((spec) => spec.required)?.translated
  const readiness = [
    ...(translatedName
      ? LANGS.map((code) => ({ label: t("ready.titleIn", { language: languageName(code, locale) }), done: hasHeading(draft, code), section: "display" }))
      : [{ label: t("ready.named"), done: hasHeading(draft, "en"), section: "display" }]),
    ...(draft.kind === "skill" ? [{ label: t("ready.skills"), done: draft.skills.length > 0, section: "skills" }] : draft.kind === "experience" || draft.kind === "project" ? [{ label: t("ready.fact"), done: facts.length > 0, section: "facts" }] : []),
    { label: draft.status === "verified" ? t("ready.checked") : t("ready.markChecked"), done: draft.status === "verified", section: "basics", action: () => patch({ status: "verified" }) },
  ]

  /* ---------- save / delete / leave ---------- */
  const save = useCallback(
    (then?: string) =>
      startTransition(async () => {
        const result = await saveEntryAction(toInput(draft), entry?.id)
        if (!result.ok) return void toast.error(t("saveFailed"), { description: result.error })
        toast.success(entry ? t("saved") : t("created"), {
          description: ungrounded.length ? t("stillNeed", { count: ungrounded.length }) : undefined,
        })
        if (then) router.push(then)
        else if (!entry && result.data) router.replace(`/profile/${result.data}`)
        else {
          router.refresh()
          if (result.data) void followTranslation(result.data)
        }
      }),
    [draft, entry, router, ungrounded.length, t, followTranslation],
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

  // A just-created entry opens here while its translation may still be running.
  useEffect(() => {
    if (entry?.id) void showTranslation(entryTranslationAction(entry.id))
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per entry
  }, [entry?.id])

  const leave = (href: string) => (dirty ? setConfirmLeave(href) : router.push(href))
  const remove = () =>
    startTransition(async () => {
      if (!entry) return
      const result = await deleteEntryAction(entry.id)
      if (!result.ok) return void toast.error(t("deleteFailed"), { description: result.error })
      toast.success(t("deleted"))
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

  const factNumber = (key: string) => draft.facts.findIndex((fact) => fact.key === key) + 1
  const unusedFacts = facts.filter((fact) => !usage[fact.key])
  const [focusBullet, setFocusBullet] = useState<string | null>(null)
  const bulletFromFact = (factKey: string, text: string) => {
    patch({ bullets: [...draft.bullets, { key: newKey(), group: groups[0] ?? "General", role: "bullet", language: lang, text: text.trim(), factKeys: [factKey] }] })
    toast.success(t("addedLine"), { description: t("addedLineBody"), action: { label: t("show"), onClick: () => jump("bullets") } })
  }
  const extras = useExtras(draft)
  const [showLines, setShowLines] = useState(draft.bullets.some((bullet) => bullet.text.trim()))

  const view = entryView(draft, lang)
  const title = view.heading || t("newEntry")
  const hasText = (code: Lang) => Object.values(draft.display[code]).some((value) => value.trim())

  return (
    <div className="-mx-4 -mt-4 md:-mx-6 md:-mt-6">
      {/* sticky action bar */}
      <div className="sticky top-0 z-20 flex flex-wrap items-center gap-x-3 gap-y-2 border-b bg-background/85 px-4 py-2.5 backdrop-blur md:px-6">
        <Button variant="ghost" size="icon-sm" onClick={() => leave("/profile")} aria-label={t("back")} title={t("back")}>
          <ArrowLeftIcon />
        </Button>
        {LOGO_KINDS.has(draft.kind) ? <EntryLogo path={draft.logoPath} name={view.subheading || title} size={36} className="rounded-lg" /> : null}
        <div className="min-w-48 flex-1 basis-64">
          <div className="truncate font-semibold" title={title}>{title}</div>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span>{tp(`kindSingular.${draft.kind}`)}</span>
            <span aria-hidden>·</span>
            <AnimatePresence mode="wait" initial={false}>
              <motion.span
                key={dirty ? "dirty" : pending ? "saving" : "saved"}
                initial={{ opacity: 0, y: 3 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -3 }}
                transition={{ duration: 0.15 }}
                className={cn("inline-flex items-center gap-1", dirty && "text-warning")}
              >
                {dirty ? <span className="size-1.5 rounded-full bg-warning" aria-hidden /> : entry ? <CheckIcon className="size-3 text-success" aria-hidden /> : null}
                {dirty ? t("unsaved") : translating ? t("translation.working") : entry ? t("allSaved") : t("notSaved")}
              </motion.span>
            </AnimatePresence>
          </div>
        </div>
        <div className="ms-auto flex flex-wrap items-center gap-2">
          <LanguageSwitch value={lang} onChange={setLang} languages={LANGS} filled={hasText} label={t("writingIn")} />
          <span className="hidden h-5 w-px bg-border sm:block" aria-hidden />
          <Segmented
            value={draft.status}
            onChange={(status) => patch({ status })}
            label={t("status")}
            options={entryStatuses.map((status) => ({
              value: status,
              label: (
                <>
                  {status === "verified" ? <ShieldCheckIcon /> : status === "needs_review" ? <CircleDashedIcon /> : <ArchiveIcon />}
                  {tp(`status.${status}`)}
                </>
              ),
              ...(status === "verified"
                ? { thumbClassName: "bg-success-soft ring-1 ring-success/30", activeClassName: "text-success" }
                : status === "needs_review"
                  ? { thumbClassName: "bg-warning-soft ring-1 ring-warning/30", activeClassName: "text-warning" }
                  : {}),
            }))}
          />
          {entry ? (
            <DropdownMenu>
              <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label={t("more")} />}>
                <MoreHorizontalIcon />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem variant="destructive" onClick={() => setConfirmDelete(true)}>
                  <TrashIcon /> {t("delete")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
          <ParticleButton
            size="sm"
            status={saveStatus}
            onClick={() => save()}
            disabled={!pending && !dirty && Boolean(entry)}
            pendingLabel={t("saving")}
            successLabel={t("saved")}
            className="min-w-20"
          >
            {entry ? t("save") : t("create")}
            <kbd className="ms-1 hidden rounded bg-primary-foreground/15 px-1 font-mono text-[10px] sm:inline">⌘S</kbd>
          </ParticleButton>
        </div>
      </div>

      <div className="grid gap-6 p-4 md:p-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="grid min-w-0 gap-6">
          {/* 1. basics */}
          <EntryAssist draft={draft} patch={patch} />
          <Section id="basics" n={1} title={t("basics.title")} description={t("basics.description")}>
            <ToggleGroup value={[draft.kind]} onValueChange={(value) => value[0] && patch({ kind: value[0] as Draft["kind"] })} variant="outline" className="flex w-full flex-wrap justify-start" spacing={2} aria-label={t("basics.type")}>
              {entryKinds.map((kind) => {
                const Icon = KIND_ICONS[kind]
                return (
                  <ToggleGroupItem key={kind} value={kind} className="gap-1.5 aria-pressed:border-foreground aria-pressed:bg-foreground aria-pressed:text-background">
                    <Icon /> {tp(`kindSingular.${kind}`)}
                  </ToggleGroupItem>
                )
              })}
            </ToggleGroup>
            {LOGO_KINDS.has(draft.kind) ? (
              <div className="grid gap-2">
                <span className="text-sm font-medium">{t(`basics.logo.${draft.kind === "education" ? "education" : draft.kind === "certification" ? "certification" : draft.kind === "project" ? "project" : "company"}`)}</span>
                <LogoField value={draft.logoPath} name={view.subheading || title} onChange={(logoPath) => patch({ logoPath })} />
              </div>
            ) : null}
          </Section>

          {/* 2. display */}
          <Section
            id="display"
            n={2}
            title={t("display.title")}
            description={t("display.description", { language: languageName(lang, locale) })}
          >
            <div key={`${draft.kind}-${lang}`} className="cb-fade">
              <KindFields draft={draft} lang={lang} patch={patch} />
            </div>
            {(() => {
              const other = LANGS.find((code) => code !== lang)!
              return !hasText(lang) && hasText(other) ? (
                <Button variant="outline" size="sm" className="w-fit" onClick={() => patch({ display: { ...draft.display, [lang]: { ...draft.display[other] } } })}>
                  <CopyIcon /> {t("display.startFrom", { language: languageName(other, locale) })}
                </Button>
              ) : null
            })()}
          </Section>

          {/* 3. facts */}
          <Section
            id="facts"
            n={3}
            title={t("facts.title")}
            description={t("facts.description")}
            done={facts.length > 0}
            meta={facts.length ? <Meta value={`${facts.length - unusedFacts.length}/${facts.length}`} label={t("facts.onLines")} /> : null}
          >
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
              placeholder={t("facts.placeholder")}
              addLabel={t("facts.add")}
              onHover={setHoverFact}
              empty={
                <EmptyState
                  title={t("facts.emptyTitle")}
                  body={t("facts.emptyBody")}
                  action={
                    <Button size="sm" onClick={() => (patch({ facts: [{ key: newKey(), statement: "" }] }), requestAnimationFrame(() => document.querySelector<HTMLTextAreaElement>("#facts textarea")?.focus()))}>
                      <PlusIcon /> {t("facts.first")}
                    </Button>
                  }
                />
              }
              renderAside={(item) =>
                !item.text.trim() ? null : usage[item.key] ? (
                  <span title={t("facts.backs", { count: usage[item.key] })} className="inline-flex h-6 items-center gap-1 rounded-full bg-success/10 px-2 text-[11px] font-medium text-success tabular-nums">
                    <CheckIcon className="size-3" /> {t("facts.lines", { count: usage[item.key] })}
                  </span>
                ) : (
                  <Button size="xs" variant="ghost" className="text-muted-foreground" title={t("facts.asLineHint")} onClick={() => bulletFromFact(item.key, item.text)}>
                    <CornerDownRightIcon /> {t("facts.asLine")}
                  </Button>
                )
              }
              renderBelow={(item, focused) => (
                <Presence show={focused && item.text.trim().length > 12 && (!/\d/.test(item.text) || item.text.length > 220)}>
                  <p className="flex items-center gap-1.5 px-3 pt-0.5 pb-1.5 text-xs text-muted-foreground">
                    <LightbulbIcon className="size-3.5 shrink-0 text-warning" />
                    {item.text.length > 220 ? t("facts.long") : t("facts.number")}
                  </p>
                </Presence>
              )}
            />
          </Section>

          {/* 4. bullets: optional, CVs fall back to the facts above */}
          {!showLines ? (
            <div className="flex flex-wrap items-center gap-3 rounded-xl border border-dashed p-4">
              <div className="grid min-w-0 flex-1 gap-0.5">
                <span className="text-sm font-medium">{t("bullets.optionalTitle")}</span>
                <span className="text-xs text-muted-foreground">{t("bullets.optionalBody")}</span>
              </div>
              <Button size="sm" variant="outline" onClick={() => setShowLines(true)} disabled={!facts.length}>
                <SparklesIcon /> {t("bullets.polish")}
              </Button>
            </div>
          ) : (
          <Section
            id="bullets"
            n={4}
            title={t("bullets.title")}
            description={t("bullets.description", { language: languageName(lang, locale) })}
            done={claimBullets.length > 0 && ungrounded.length === 0}
            meta={claimBullets.length ? <Meta value={`${claimBullets.length - ungrounded.length}/${claimBullets.length}`} label={t("bullets.backed")} warn={ungrounded.length > 0} /> : null}
            action={
              groups.length ? (
                <Button variant="ghost" size="sm" onClick={addGroup}>
                  <PlusIcon /> {t("bullets.group")}
                </Button>
              ) : null
            }
          >
            <BulletSuggestions
              input={{
                kind: draft.kind,
                entry: describeEntry(draft, lang),
                facts: facts.map((fact) => ({ key: fact.key, statement: fact.statement })),
                existing: draft.bullets.map((bullet) => bullet.text).filter(Boolean),
                languages: [...LANGS],
              }}
              unused={unusedFacts.length}
              factNumber={factNumber}
              onAdd={(list) =>
                patch({ bullets: [...draft.bullets, ...list.map((suggestion) => ({ key: newKey(), group: groups[0] ?? "General", role: "bullet" as const, language: suggestion.language as Lang, text: suggestion.text, factKeys: suggestion.factKeys }))] })
              }
            />
            <PresenceList>
              {groups.map((group) => {
                const rows = pairRows(draft.bullets.filter((bullet) => bullet.group === group))
                const addRow = () => {
                  const created = LANGS.map((language) => ({ key: newKey(), group, role: "bullet" as const, language, text: "", factKeys: [] }))
                  patch({ bullets: [...draft.bullets, ...created] })
                  setFocusBullet(created.find((bullet) => bullet.language === lang)?.key ?? null)
                }
                return (
                  <PresenceItem key={group} className="grid gap-1 rounded-xl border bg-muted/20 p-2 sm:p-3">
                    <div className="flex items-center gap-2 ps-1">
                      <Input
                        defaultValue={group}
                        onBlur={(event) => event.target.value.trim() && event.target.value !== group && renameGroup(group, event.target.value.trim())}
                        onKeyDown={(event) => event.key === "Enter" && event.currentTarget.blur()}
                        className="h-8 max-w-64 border-transparent bg-transparent px-2 font-medium shadow-none hover:border-input focus-visible:border-ring dark:bg-transparent"
                        aria-label={t("bullets.groupName")}
                      />
                      <span className="ms-auto text-xs text-muted-foreground tabular-nums">
                        {t("bullets.count", { count: rows.length })} · {languageName(lang, locale)}
                      </span>
                    </div>
                    <div key={lang} className="cb-fade grid gap-1">
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
                                  autoFocus={focusBullet === bullet.key}
                                  onEnter={addRow}
                                  onChange={(value) => updateBullet(bullet.key, value)}
                                  onRemove={() => patch({ bullets: draft.bullets.filter((item) => item.key !== bullet.key) })}
                                />
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => patch({ bullets: [...draft.bullets, { key: newKey(), group, role: sibling?.role ?? "bullet", language: lang, text: "", factKeys: sibling?.factKeys ?? [] }] })}
                                  className="grid w-full gap-1 rounded-lg border border-dashed p-3 text-start text-xs text-muted-foreground transition-colors hover:border-ring hover:text-foreground"
                                >
                                  <span className="flex items-center gap-1.5 font-medium"><PlusIcon className="size-3.5" /> {t("bullets.addVersion", { language: languageName(lang, locale) })}</span>
                                  {sibling?.text ? <span className="line-clamp-2">{sibling.text}</span> : null}
                                </button>
                              )}
                            </PresenceItem>
                          )
                        })}
                      </PresenceList>
                    </div>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={addRow}>
                        <PlusIcon /> {t("bullets.addLine")}
                      </Button>
                      {rows.length === 0 ? (
                        <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => addBullet(group, "en")}>
                          <PlusIcon /> {t("bullets.only", { language: languageName("en", locale) })}
                        </Button>
                      ) : null}
                    </div>
                  </PresenceItem>
                )
              })}
            </PresenceList>
          </Section>
          )}

          {/* 5. skills */}
          <Section
            id="skills"
            n={5}
            title={t("skills.title")}
            description={t("skills.description")}
            done={draft.skills.length > 0}
            action={<AskExtrasButton extras={extras} />}
          >
            <SkillFields draft={draft} patch={patch} extras={extras} />
          </Section>

          {/* 6. guardrails */}
          <Section id="guardrails" n={6} title={t("guardrails.title")} description={t("guardrails.description")} done={draft.doNotClaim.some((rule) => rule.trim()) || draft.confidential}>
            <GuardrailFields draft={draft} patch={patch} extras={extras} />
          </Section>
        </div>

        {/* aside */}
        <aside className="grid content-start gap-4 xl:sticky xl:top-20 xl:max-h-[calc(100svh-6rem)] xl:overflow-y-auto xl:[scrollbar-width:none]">
          <Readiness items={readiness} onJump={jump} />
          <PreviewCard draft={draft} lang={lang} onLang={setLang} grounding={grounding} />
          <SectionIndex sections={SECTIONS.filter((id) => showLines || id !== "bullets").map((id) => ({ id, label: t(`sections.${id}`) }))} incomplete={new Set(readiness.filter((item) => !item.done).map((item) => item.section))} onJump={jump} />
        </aside>
      </div>

      <AlertDialog open={confirmLeave !== null} onOpenChange={(open) => !open && setConfirmLeave(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("leave.title")}</AlertDialogTitle>
            <AlertDialogDescription>{t("leave.body")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("leave.keep")}</AlertDialogCancel>
            <Button variant="outline" onClick={() => confirmLeave && router.push(confirmLeave)}>
              {t("leave.discard")}
            </Button>
            <AlertDialogAction onClick={() => confirmLeave && save(confirmLeave)}>{t("leave.save")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("deleteDialog.title", { title })}</AlertDialogTitle>
            <AlertDialogDescription>{t("deleteDialog.body")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("deleteDialog.cancel")}</AlertDialogCancel>
            <Button variant="outline" onClick={() => (setConfirmDelete(false), patch({ status: "archived" }))}>
              {t("deleteDialog.archive")}
            </Button>
            <UndoButton label={t("deleteDialog.delete")} doneLabel={t("deleted")} icon={TrashIcon} className="h-8 text-destructive" resetAfter={null} disabled={pending} onCommit={remove} />
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function Section({ id, n, title, description, action, meta, done, children }: { id: string; n: number; title: string; description: string; action?: React.ReactNode; meta?: React.ReactNode; done?: boolean; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-20">
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-x-4 gap-y-2">
          <div className="flex min-w-0 flex-1 basis-72 gap-3">
            <span
              className={cn(
                "mt-0.5 grid size-6 shrink-0 place-content-center rounded-full text-xs font-semibold tabular-nums transition-colors duration-300",
                done ? "bg-success/15 text-success" : "bg-muted text-muted-foreground",
              )}
            >
              <AnimatePresence mode="popLayout" initial={false}>
                <motion.span key={done ? "done" : "n"} initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.6 }} transition={{ duration: 0.18, ease: EASE }}>
                  {done ? <CheckIcon className="size-3.5" strokeWidth={3} /> : n}
                </motion.span>
              </AnimatePresence>
            </span>
            <div className="grid min-w-0 gap-1">
              <CardTitle>{title}</CardTitle>
              <CardDescription className="text-pretty">{description}</CardDescription>
            </div>
          </div>
          {meta || action ? (
            <div className="ms-auto flex items-center gap-2">
              {meta}
              {action}
            </div>
          ) : null}
        </CardHeader>
        <CardContent className="grid gap-4">{children}</CardContent>
      </Card>
    </section>
  )
}

/** A live count in a section header, e.g. "3/4 on CV lines". */
function Meta({ value, label, warn }: { value: string; label: string; warn?: boolean }) {
  return (
    <span className={cn("inline-flex items-baseline gap-1 rounded-full px-2.5 py-1 text-xs", warn ? "bg-warning/10 text-warning" : "bg-muted text-muted-foreground")}>
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span key={value} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.16, ease: EASE }} className="font-semibold text-foreground tabular-nums">
          {value}
        </motion.span>
      </AnimatePresence>
      {label}
    </span>
  )
}

function EmptyState({ title, body, action }: { title: string; body: string; action: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed px-4 py-8 text-center">
      <p className="text-sm font-medium">{title}</p>
      <p className="max-w-md text-xs text-pretty text-muted-foreground">{body}</p>
      <div className="mt-1">{action}</div>
    </div>
  )
}

function BulletCard({
  bullet,
  facts,
  check,
  highlighted,
  autoFocus,
  onEnter,
  onChange,
  onRemove,
}: {
  bullet: DraftBullet
  facts: { key: string; statement: string }[]
  check?: ReturnType<typeof verifySupport>
  highlighted: boolean
  autoFocus?: boolean
  onEnter: () => void
  onChange: (value: Partial<DraftBullet>) => void
  onRemove: () => void
}) {
  const t = useTranslations("entryEditor")
  const linked = facts.map((fact, index) => ({ ...fact, n: index + 1 })).filter((fact) => bullet.factKeys.includes(fact.key))
  const isLabel = bullet.role === "label"
  const empty = !bullet.text.trim()
  const warn = !isLabel && !empty && !check?.grounded
  const long = bullet.text.length > 220
  return (
    <div
      className={cn(
        "group/bullet grid gap-1.5 rounded-lg border border-transparent bg-background p-1.5 pe-1 shadow-xs ring-1 ring-foreground/5 transition-[box-shadow,border-color] duration-200 focus-within:ring-foreground/15",
        highlighted && "ring-2 ring-brand/50 focus-within:ring-brand/50",
        warn && "border-warning/40",
      )}
    >
      <div className="flex items-start gap-1">
        <span className="grid h-9 w-6 shrink-0 place-content-center" title={isLabel ? t("bullet.label") : empty ? t("bullet.empty") : check?.grounded ? t("bullet.backed") : t("bullet.notBacked")}>
          {isLabel ? (
            <span className="text-[10px] font-semibold text-muted-foreground">H</span>
          ) : empty ? (
            <span className="size-1.5 rounded-full bg-muted-foreground/40" />
          ) : check?.grounded ? (
            <ShieldCheckIcon className="size-4 text-success" />
          ) : (
            <AlertTriangleIcon className="size-4 text-warning" />
          )}
        </span>
        <GrowText
          value={bullet.text}
          autoFocus={autoFocus}
          onChange={(event) => onChange({ text: event.target.value })}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault()
              onEnter()
            } else if (event.key === "Backspace" && !bullet.text && !bullet.factKeys.length) {
              event.preventDefault()
              onRemove()
            }
          }}
          placeholder={isLabel ? t("bullet.sectionLabel") : t("bullet.placeholder")}
          className={cn(QUIET, "px-2")}
        />
        <Button size="icon-sm" variant="ghost" className="mt-1 text-muted-foreground opacity-0 transition-opacity group-hover/bullet:opacity-100 focus-visible:opacity-100 pointer-coarse:opacity-100" aria-label={t("bullet.remove")} onClick={onRemove}>
          <XIcon />
        </Button>
      </div>
      {isLabel ? null : (
        <div className="flex flex-wrap items-center gap-1 ps-7">
          <PresenceList>
            {linked.map((fact) => (
              <motion.span
                key={fact.key}
                layout="position"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ duration: 0.15, ease: EASE }}
                title={fact.statement}
                className="inline-flex h-6 max-w-full items-center gap-1 rounded-md bg-muted ps-1 pe-0.5 text-xs text-muted-foreground"
              >
                <span className="grid h-4 min-w-4 place-content-center rounded bg-background px-1 text-[10px] font-semibold text-foreground tabular-nums">{fact.n}</span>
                <span className="max-w-56 truncate">{fact.statement}</span>
                <button type="button" aria-label={t("bullet.unlink", { n: fact.n })} className="grid size-5 place-content-center rounded-sm hover:bg-foreground/10 hover:text-foreground" onClick={() => onChange({ factKeys: bullet.factKeys.filter((key) => key !== fact.key) })}>
                  <XIcon className="size-3" />
                </button>
              </motion.span>
            ))}
          </PresenceList>
          <FactPicker facts={facts} selected={bullet.factKeys} onChange={(factKeys) => onChange({ factKeys })} />
          {bullet.autoText && bullet.text === bullet.autoText ? <AutoBadge /> : null}
          {warn ? (
            <span className="cb-fade inline-flex items-center gap-1 text-xs text-warning">
              {check?.unsupportedNumbers.length ? t("bullet.noFactStates", { numbers: check.unsupportedNumbers.join(", ") }) : t("bullet.link")}
            </span>
          ) : long ? (
            <span className="cb-fade text-xs text-muted-foreground">Long for a CV line ({bullet.text.length} characters)</span>
          ) : null}
        </div>
      )}
    </div>
  )
}

function Preview({ draft, lang, grounding }: { draft: Draft; lang: Lang; grounding: Record<string, ReturnType<typeof verifySupport>> }) {
  const locale = useLocale()
  const t = useTranslations("entryEditor")
  const view = entryView({ ...draft, display: { [lang]: draft.display[lang] } }, lang)
  const bullets = draft.bullets.filter((bullet) => bullet.language === lang && bullet.role === "bullet" && bullet.text.trim())
  if (!view.heading && !bullets.length) {
    return <p className="text-xs text-muted-foreground">{t("preview.fill", { language: languageName(lang, locale) })}</p>
  }
  return (
    <div className="grid gap-2 rounded-md border bg-white p-3 text-[12.5px] leading-snug text-zinc-900 shadow-sm dark:bg-zinc-50">
      <div className="flex items-start gap-2.5">
        {draft.logoPath ? <EntryLogo path={draft.logoPath} name={view.subheading || view.heading} size={30} className="border-zinc-200 bg-white" /> : null}
        <div className="grid min-w-0 flex-1 gap-0.5">
          <div className="flex items-baseline justify-between gap-2">
            <span className="font-semibold">{view.heading || "—"}</span>
            <span className="shrink-0 text-[11px] text-zinc-500">{view.dates}</span>
          </div>
          {view.subheading || view.location ? (
            <div className="flex justify-between gap-2 text-[11px] text-zinc-600 italic">
              <span>{view.subheading}</span>
              <span>{view.location}</span>
            </div>
          ) : null}
          {view.details.length ? <div className="text-[11px] text-zinc-500">{view.details.join(" · ")}</div> : null}
        </div>
      </div>
      {bullets.length ? (
        <ul className="grid list-disc gap-1 ps-4">
          {bullets.map((bullet) => (
            <li key={bullet.key} className={cn(!grounding[bullet.key]?.grounded && "decoration-warning decoration-wavy underline-offset-2 [text-decoration-line:underline]")}>
              {bullet.text.replace(/\*\*(.+?)\*\*/g, "$1")}
            </li>
          ))}
        </ul>
      ) : null}
      {bullets.some((bullet) => !grounding[bullet.key]?.grounded) ? <p className="text-[10.5px] text-warning">{t("preview.wavy")}</p> : null}
    </div>
  )
}

/* ---------------------------------- aside ---------------------------------- */

const EASE = [0.23, 1, 0.32, 1] as const
type Check = { label: string; done: boolean; section: string; action?: () => void }

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
          className={cn("fill-none", complete ? "stroke-success" : "stroke-warning")}
          initial={reduce ? false : { strokeDashoffset: c }}
          animate={{ strokeDashoffset: c * (1 - value / total) }}
          transition={{ duration: 0.6, ease: EASE }}
        />
      </svg>
      <span className="absolute inset-0 grid place-content-center">
        {complete ? <CheckCircle2Icon className="size-4 text-success" /> : <span className="text-[11px] font-semibold tabular-nums">{value}/{total}</span>}
      </span>
    </div>
  )
}

/** All good: one calm line. Something missing: the missing steps first, each a shortcut to its section. */
function Readiness({ items, onJump }: { items: Check[]; onJump: (id: string) => void }) {
  const t = useTranslations("entryEditor")
  const done = items.filter((item) => item.done).length
  const complete = done === items.length
  const [open, setOpen] = useState(!complete)
  const todo = items.filter((item) => !item.done)
  const finished = items.filter((item) => item.done)
  return (
    <Card size="sm" className={cn("gap-0 overflow-hidden transition-colors", complete && "border-success/30 bg-gradient-to-b from-success-soft to-transparent")}>
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="flex w-full items-center gap-3 px-4 py-1 text-start">
        {complete ? <Otter pose="all-checked" height={44} className="-my-1" /> : <ProgressRing value={done} total={items.length} />}
        <span className="grid min-w-0 flex-1 gap-0.5">
          <span className="text-sm font-medium">{complete ? t("readiness.ready") : t("readiness.steps", { count: items.length - done })}</span>
          <span className="text-xs text-muted-foreground">{complete ? t("readiness.allPass", { count: items.length }) : t("readiness.skip")}</span>
        </span>
        <ChevronDownIcon className={cn("size-4 shrink-0 text-muted-foreground transition-transform duration-200", open && "rotate-180")} />
      </button>
      <AnimatePresence initial={false}>
        {open ? (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.22, ease: EASE }} className="overflow-hidden">
            <ul className="grid gap-0.5 px-2 pt-2 pb-1">
              {[...todo, ...finished].map((item) => (
                <li key={item.label}>
                  <button type="button" onClick={() => (!item.done && item.action ? item.action() : onJump(item.section))} className={cn("group flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-start text-sm transition-colors hover:bg-muted", !item.done && "bg-warning-soft")}>
                    {item.done ? <CheckCircle2Icon className="size-4 shrink-0 text-success" /> : item.section === "bullets" ? <AlertTriangleIcon className="size-4 shrink-0 text-warning" /> : <CircleDashedIcon className="size-4 shrink-0 text-warning" />}
                    <span className={cn("min-w-0 flex-1", item.done ? "text-muted-foreground" : "font-medium")}>{item.label}</span>
                    {!item.done ? <span className={cn("text-[11px] text-muted-foreground transition-opacity", item.action ? "font-medium text-primary" : "opacity-0 group-hover:opacity-100")}>{item.action ? t("readiness.confirm") : t("readiness.fix")}</span> : null}
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
  const t = useTranslations("entryEditor")
  return (
    <Card size="sm" className="gap-3">
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle className="flex items-center gap-1.5 text-sm">
          <BookOpenIcon className="size-4" /> {t("preview.title")}
        </CardTitle>
        <LayoutGroup id="preview-lang">
          <div role="tablist" aria-label={t("preview.language")} className="flex rounded-md bg-muted p-0.5">
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
  const t = useTranslations("entryEditor")
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
    <nav className="hidden xl:grid" aria-label={t("sectionsLabel")}>
      <p className="mb-1.5 px-3 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">{t("onThisPage")}</p>
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
                {incomplete.has(section.id) ? <span className="size-1.5 rounded-full bg-warning" aria-label={t("needsSomething")} /> : null}
              </button>
            </li>
          ))}
        </ol>
      </LayoutGroup>
    </nav>
  )
}
