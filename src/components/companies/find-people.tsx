"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { AnimatePresence, MotionConfig, motion } from "motion/react"
import { CheckIcon, PlusIcon, SearchIcon, SparklesIcon, UsersIcon, XIcon } from "lucide-react"
import { toast } from "sonner"
import { findPeopleAction, refreshRoleGroupsAction, saveContactAction } from "@/app/[locale]/(app)/contacts/actions"
import { Badge } from "@/components/reui/badge"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle } from "@/components/ui/item"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { defaultGroups, searchTitles, type CompanyPerson, type RoleGroup } from "@/lib/company-people"
import { cn } from "@/lib/utils"
import { useLocale, useTranslations } from "next-intl"

type Person = CompanyPerson & { saved: boolean }
type AddState = "idle" | "adding" | "added"

const EASE = [0.23, 1, 0.32, 1] as const

/** "Ada Lovelace" → "AL". */
const initials = (name: string) =>
  name
    .replace(/[^\p{L}\s-]/gu, "")
    .split(/[\s-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]!.toUpperCase())
    .join("") || "?"

/** "Neuilly-sur-Seine, Île-de-France, France, Europe" → "Neuilly-sur-Seine"; regions read as noise in a list. */
const place = (location: string) => location.split(",")[0]?.trim().replace(/ Metropolitan Region$/, "") ?? ""

/** Find people who work at the company (Apify, your own token) and keep the ones worth writing to as contacts. */
export function FindPeople({ companyId, companyName, hasWebsite, startup = null, startupKnown = false, roleGroups }: { companyId: string; companyName: string; hasWebsite: boolean; /** From the company's public facts: small and young. */ startup?: { size: string; since: string } | null; /** Whether the facts could tell; when not, founders are searched too. */ startupKnown?: boolean; /** Who to look for, generated from your profile and goals (or the built-in groups). */ roleGroups: { groups: RoleGroup[]; generated: boolean } }) {
  const t = useTranslations("company.findPeople")
  const router = useRouter()
  const locale = useLocale() as "en" | "fr" | "ar"
  // Groups of people to reach (every way their title is written), chosen for this company, plus your own titles.
  const [source, setSource] = useState(roleGroups)
  const groups = source.groups
  const [families, setFamilies] = useState<string[]>(() => defaultGroups(roleGroups.groups, startupKnown ? Boolean(startup) : null))
  const [regenerating, startRegenerate] = useTransition()
  const regenerate = () =>
    startRegenerate(async () => {
      const result = await refreshRoleGroupsAction().catch(() => ({ ok: false as const, message: t("failed") }))
      if (!result.ok) return void toast.error(t("groupsFailed"), { description: result.message })
      setSource(result.data)
      setFamilies(defaultGroups(result.data.groups, startupKnown ? Boolean(startup) : null))
      toast.success(t("groupsReady"))
    })
  const groupLabel = (group: RoleGroup) => (group.label ? group.label[locale] ?? group.label.en : t(`family.${group.id as "founders"}`))
  const [custom, setCustom] = useState<string[]>([])
  const [draftTitle, setDraftTitle] = useState("")
  const titles = searchTitles(groups, families, custom)
  const addCustom = () => {
    const fresh = draftTitle.split(",").map((title) => title.trim()).filter((title) => title && !custom.some((item) => item.toLowerCase() === title.toLowerCase()))
    if (fresh.length) setCustom([...custom, ...fresh].slice(0, 10))
    setDraftTitle("")
  }
  const [people, setPeople] = useState<Person[] | null>(null)
  const [broadened, setBroadened] = useState(false)
  const [states, setStates] = useState<Record<string, AddState>>({})
  const [page, setPage] = useState("")
  const [askPage, setAskPage] = useState(!hasWebsite)
  const [searching, startSearch] = useTransition()
  const [, startAdd] = useTransition()

  const search = () =>
    startSearch(async () => {
      const result = await findPeopleAction(companyId, titles, page).catch(() => ({ ok: false as const, message: t("failed") }))
      if (!result.ok && "setup" in result) return void toast.info(t("setup"), { action: { label: t("setupOpen"), onClick: () => router.push("/integrations#job-discovery") } })
      if (!result.ok) return void toast.error(t("failed"), { description: result.message })
      setStates({})
      setPeople(result.data.people)
      setBroadened(result.data.broadened)
      if (result.data.unknownCompany) setAskPage(true)
    })

  const add = (list: Person[]) => {
    if (!list.length) return
    setStates((current) => ({ ...current, ...Object.fromEntries(list.map((person) => [person.linkedinUrl, "adding" as const])) }))
    startAdd(async () => {
      const results = await Promise.all(
        list.map(async (person) => ({ person, result: await saveContactAction({ name: person.name, title: person.title, companyName, linkedinUrl: person.linkedinUrl, email: person.email, notes: person.location, source: "import" }).catch(() => ({ ok: false as const, message: t("failed") })) })),
      )
      const added = results.filter(({ result }) => result.ok).map(({ person }) => person)
      const failed = results.filter(({ result }) => !result.ok)
      setStates((current) => ({ ...current, ...Object.fromEntries(results.map(({ person, result }) => [person.linkedinUrl, result.ok ? ("added" as const) : ("idle" as const)])) }))
      if (failed.length) toast.error(failed[0].result.ok ? t("failed") : failed[0].result.message)
      if (added.length) {
        toast.success(added.length === 1 ? t("added", { name: added[0].name }) : t("addedMany", { count: added.length }))
        router.refresh()
      }
    })
  }

  const stateOf = (person: Person): AddState => states[person.linkedinUrl] ?? (person.saved ? "added" : "idle")
  const open = people?.filter((person) => stateOf(person) === "idle") ?? []

  return (
    <MotionConfig reducedMotion="user" transition={{ duration: 0.22, ease: EASE }}>
      <Card id="find-people" className="scroll-mt-6 gap-4">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><UsersIcon className="size-4" /> {t("title")}</CardTitle>
          <CardDescription>{t("description", { name: companyName })}</CardDescription>
          {startup ? (
            <p className="flex flex-wrap items-center gap-1.5 pt-1 text-xs text-muted-foreground">
              <Badge variant="info-light" size="sm">{t("startup")}</Badge>
              {t("startupWhy", { since: startup.since, size: startup.size })}
            </p>
          ) : null}
        </CardHeader>
        <CardContent className="grid gap-3 text-sm">
          <form
            className="grid gap-2"
            onSubmit={(event) => {
              event.preventDefault()
              search()
            }}
          >
            <AnimatePresence initial={false}>
              {askPage ? (
                <motion.div key="page" className="grid gap-1 overflow-hidden" initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}>
                  <Input value={page} onChange={(event) => setPage(event.target.value)} aria-label={t("linkedinPage")} placeholder="linkedin.com/company/…" inputMode="url" />
                  <p className="text-xs text-muted-foreground">{t("linkedinPageHelp")}</p>
                </motion.div>
              ) : null}
            </AnimatePresence>
            <div className="grid gap-2">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-medium">{t("titles")}</p>
                <Button type="button" size="xs" variant="ghost" className="text-muted-foreground" onClick={regenerate} disabled={regenerating} title={t("regenerateHint")}>
                  {regenerating ? <Spinner /> : <SparklesIcon data-icon="inline-start" />} {source.generated ? t("regenerate") : t("tailor")}
                </Button>
              </div>
              <div className="flex flex-wrap gap-1.5" role="group" aria-label={t("titles")}>
                {groups.map(({ id: family, titles: variants, ...group }) => {
                  const on = families.includes(family)
                  return (
                    <Button
                      key={family}
                      type="button"
                      size="xs"
                      variant={on ? "secondary" : "outline"}
                      aria-pressed={on}
                      title={variants.slice(0, 8).join(", ") + (variants.length > 8 ? "…" : "")}
                      onClick={() => setFamilies(on ? families.filter((item) => item !== family) : [...families, family])}
                      className={cn("transition-colors", on && "ring-1 ring-foreground/15")}
                    >
                      {on ? <CheckIcon data-icon="inline-start" /> : <PlusIcon data-icon="inline-start" />} {groupLabel({ id: family, titles: variants, ...group })}
                    </Button>
                  )
                })}
                <AnimatePresence initial={false}>
                  {custom.map((title) => (
                    <motion.span key={title} layout initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }}>
                      <Badge variant="primary-light" className="h-6 gap-1 ps-2 pe-1">
                        {title}
                        <button type="button" onClick={() => setCustom(custom.filter((item) => item !== title))} aria-label={t("removeTitle", { title })} className="inline-flex size-4 items-center justify-center rounded-sm opacity-70 hover:opacity-100">
                          <XIcon className="size-3" />
                        </button>
                      </Badge>
                    </motion.span>
                  ))}
                </AnimatePresence>
              </div>
              <div className="flex gap-2">
                <Input
                  value={draftTitle}
                  onChange={(event) => setDraftTitle(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === ",") {
                      event.preventDefault()
                      addCustom()
                    }
                  }}
                  onBlur={addCustom}
                  aria-label={t("addTitle")}
                  placeholder={t("addTitlePlaceholder")}
                />
                <Button type="submit" className="shrink-0" disabled={searching || !titles.length || (askPage && !hasWebsite && !page.trim())}>
                  {searching ? <Spinner /> : <SearchIcon />} {t("search")}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                {titles.length ? t("titleCount", { count: titles.length }) : t("titleNone")}
                {source.generated ? ` · ${t("tailored")}` : ""}
              </p>
            </div>
          </form>

          <div aria-live="polite" aria-busy={searching}>
            <AnimatePresence mode="wait" initial={false}>
              {searching ? (
                <motion.div key="loading" className="grid gap-2" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                  <p className="text-xs text-muted-foreground">{t("wait")}</p>
                  <ItemGroup className="gap-1">
                    {[0, 1, 2].map((index) => (
                      <div key={index} className="flex items-center gap-2.5 px-3 py-2.5">
                        <Skeleton className="size-8 rounded-full" />
                        <div className="grid flex-1 gap-1.5">
                          <Skeleton className="h-3.5 w-1/3" />
                          <Skeleton className="h-3 w-1/2" />
                        </div>
                      </div>
                    ))}
                  </ItemGroup>
                </motion.div>
              ) : people ? (
                <motion.div key="results" className="grid gap-2" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                  {people.length ? (
                    <>
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs text-muted-foreground">{broadened ? t("broadened", { count: people.length }) : t("found", { count: people.length })}</p>
                        {open.length > 1 ? (
                          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => add(open)}>
                            <PlusIcon /> {t("addAll", { count: open.length })}
                          </Button>
                        ) : null}
                      </div>
                      <ItemGroup className="gap-1">
                        {people.map((person, index) => (
                          <PersonRow key={person.linkedinUrl} person={person} index={index} state={stateOf(person)} onAdd={() => add([person])} />
                        ))}
                      </ItemGroup>
                    </>
                  ) : (
                    <p className="text-xs text-muted-foreground">{askPage && !page.trim() ? t("unknownCompany") : t("none")}</p>
                  )}
                </motion.div>
              ) : null}
            </AnimatePresence>
          </div>

          <p className="text-xs text-muted-foreground">{t("privacy")}</p>
        </CardContent>
      </Card>
    </MotionConfig>
  )
}

function PersonRow({ person, index, state, onAdd }: { person: Person; index: number; state: AddState; onAdd: () => void }) {
  const t = useTranslations("company.findPeople")
  const where = place(person.location)
  return (
    <motion.div role="listitem" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(index, 8) * 0.04 }}>
      <Item size="sm" className={cn("transition-colors duration-300 hover:bg-muted/40", state === "added" && "bg-muted/30")}>
        <ItemMedia>
          <Avatar className="size-8">
            <AvatarFallback className="text-xs font-medium">{initials(person.name)}</AvatarFallback>
          </Avatar>
        </ItemMedia>
        <ItemContent className="min-w-0 gap-0.5">
          <ItemTitle className="w-full">
            <a href={person.linkedinUrl} target="_blank" rel="noreferrer" className="truncate hover:underline">{person.name}</a>
          </ItemTitle>
          <ItemDescription className="truncate text-xs">{[person.title, where].filter(Boolean).join(" · ")}</ItemDescription>
        </ItemContent>
        <ItemActions>
          <AddButton state={state} name={person.name} onAdd={onAdd} label={{ add: t("add"), adding: t("adding"), added: t("saved"), aria: t("addLabel", { name: person.name }) }} />
        </ItemActions>
      </Item>
    </motion.div>
  )
}

/** Add → spinner → a "saved" badge. The width follows the label, and the label crossfades with a short blur, so the swap reads as one control changing state. */
function AddButton({ state, onAdd, label }: { state: AddState; name: string; onAdd: () => void; label: { add: string; adding: string; added: string; aria: string } }) {
  const swap = { initial: { opacity: 0, y: 4, filter: "blur(2px)" }, animate: { opacity: 1, y: 0, filter: "blur(0px)" }, exit: { opacity: 0, y: -4, filter: "blur(2px)" } }
  return (
    <motion.div layout className="flex justify-end">
      <AnimatePresence mode="popLayout" initial={false}>
        {state === "added" ? (
          <motion.span key="added" {...swap}>
            <Badge variant="success-light" className="gap-1">
              <motion.span initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring", duration: 0.35, bounce: 0.4 }} className="inline-flex">
                <CheckIcon />
              </motion.span>
              {label.added}
            </Badge>
          </motion.span>
        ) : (
          <motion.span key="button" {...swap}>
            <Button size="sm" variant="outline" disabled={state === "adding"} aria-busy={state === "adding"} aria-label={label.aria} onClick={onAdd} className="active:scale-[0.97]">
              <AnimatePresence mode="popLayout" initial={false}>
                <motion.span key={state} className="inline-flex items-center gap-1.5" {...swap}>
                  {state === "adding" ? <Spinner /> : <PlusIcon />} {state === "adding" ? label.adding : label.add}
                </motion.span>
              </AnimatePresence>
            </Button>
          </motion.span>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
