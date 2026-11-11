"use client"

import { useRouter } from "next/navigation"
import { useEffect, useState, useTransition } from "react"
import { BriefcaseBusinessIcon, Building2Icon, FileTextIcon, LayoutDashboardIcon, LayoutTemplateIcon, PlusIcon, SearchIcon, SettingsIcon, SparklesIcon, UserIcon, UsersIcon, ActivityIcon, type LucideIcon } from "lucide-react"
import { quickSearchAction } from "@/app/[locale]/(app)/search/actions"
import { Button } from "@/components/ui/button"
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator, CommandShortcut } from "@/components/ui/command"
import { Command } from "@/components/ui/command"
import { useTranslations } from "next-intl"

// Labels and search keywords live in the `search.pages` catalog (keywords: English + the locale's own words).
const PAGES: { key: "dashboard" | "applications" | "archived" | "jobs" | "companies" | "contacts" | "profile" | "templates" | "runs" | "settings" | "ai" | "setup"; href: string; icon: LucideIcon }[] = [
  { key: "dashboard", href: "/", icon: LayoutDashboardIcon },
  { key: "applications", href: "/applications", icon: FileTextIcon },
  { key: "archived", href: "/applications?show=archived", icon: FileTextIcon },
  { key: "jobs", href: "/jobs", icon: BriefcaseBusinessIcon },
  { key: "companies", href: "/companies", icon: Building2Icon },
  { key: "contacts", href: "/contacts", icon: UsersIcon },
  { key: "profile", href: "/profile", icon: UserIcon },
  { key: "templates", href: "/templates", icon: LayoutTemplateIcon },
  { key: "runs", href: "/runs", icon: ActivityIcon },
  { key: "settings", href: "/settings", icon: SettingsIcon },
  { key: "ai", href: "/integrations#ai", icon: SettingsIcon },
  { key: "setup", href: "/setup", icon: SparklesIcon },
]

type Results = Awaited<ReturnType<typeof quickSearchAction>>

/** Ctrl/⌘ K: jump to any page, job, application or company. */
export function CommandMenu() {
  const router = useRouter()
  const t = useTranslations("search")
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<Results>({ jobs: [], companies: [] })
  const [pending, startTransition] = useTransition()
  const [selected, setSelected] = useState("")

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key?.toLowerCase() === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault()
        setOpen((value) => !value)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  useEffect(() => {
    const q = query.trim()
    if (!q) return
    let current = true
    const timer = setTimeout(() => startTransition(async () => {
      const next = await quickSearchAction(q)
      if (!current) return
      setResults(next)
      // Results arrive after typing: highlight the best match, not a stale item.
      const first = next.jobs[0] ? `job-${next.jobs[0].id}` : next.companies[0] ? `company-${next.companies[0].id}` : ""
      if (first) setSelected(first)
    }), 150)
    return () => {
      current = false
      clearTimeout(timer)
    }
  }, [query])

  const go = (href: string) => {
    setOpen(false)
    setQuery("")
    router.push(href)
  }
  const q = query.trim().toLowerCase()
  const pages = PAGES.map((page) => ({ ...page, label: t(`pages.${page.key}.label`) })).filter((page) => !q || `${page.label} ${t(`pages.${page.key}.keywords`)}`.toLowerCase().includes(q))
  const jobs = q ? results.jobs : []
  const companies = q ? results.companies : []

  return (
    <>
      <Button variant="outline" size="sm" aria-label={t("search")} className="size-8 justify-center gap-2 text-muted-foreground @min-[30rem]/workspace:h-8 @min-[30rem]/workspace:w-64 @min-[30rem]/workspace:justify-start" onClick={() => setOpen(true)}>
        <SearchIcon />
        <span className="hidden flex-1 text-start @min-[30rem]/workspace:inline">{t("placeholderShort")}</span>
        <kbd className="hidden rounded border px-1 font-mono text-[11px] @min-[30rem]/workspace:inline">Ctrl K</kbd>
      </Button>
      <CommandDialog className="sm:max-w-xl" open={open} onOpenChange={(value) => { setOpen(value); if (!value) setQuery("") }} title={t("search")} description={t("description")}>
        <Command shouldFilter={false} value={selected} onValueChange={setSelected}>
          <CommandInput placeholder={t("placeholder")} value={query} onValueChange={setQuery} />
          <CommandList>
            <CommandEmpty>{pending ? t("searching") : t("empty")}</CommandEmpty>
            {jobs.length ? (
              <CommandGroup heading={t("jobsAndApplications")}>
                {jobs.map((job) => (
                  <CommandItem key={job.id} value={`job-${job.id}`} onSelect={() => go(job.applicationId ? `/applications/${job.applicationId}` : `/jobs/${job.id}`)}>
                    <BriefcaseBusinessIcon />
                    <span className="truncate">{job.title}</span>
                    {job.company ? <span className="truncate text-muted-foreground">{job.company}</span> : null}
                    <CommandShortcut>{job.applicationId ? t("application") : t("job")}</CommandShortcut>
                  </CommandItem>
                ))}
              </CommandGroup>
            ) : null}
            {companies.length ? (
              <CommandGroup heading={t("companies")}>
                {companies.map((company) => (
                  <CommandItem key={company.id} value={`company-${company.id}`} onSelect={() => go(`/companies/${company.id}`)}>
                    <Building2Icon />
                    {company.name}
                  </CommandItem>
                ))}
              </CommandGroup>
            ) : null}
            {(jobs.length || companies.length) && pages.length ? <CommandSeparator /> : null}
            {pages.length ? (
              <CommandGroup heading={t("goTo")}>
                {pages.map((page) => (
                  <CommandItem key={page.href} value={`page-${page.href}`} onSelect={() => go(page.href)}>
                    <page.icon />
                    {page.label}
                  </CommandItem>
                ))}
              </CommandGroup>
            ) : null}
            {!q || t("addJobMatch").toLowerCase().includes(q) ? (
              <CommandGroup heading={t("actions")}>
                <CommandItem value="action-add-job" onSelect={() => go("/jobs?add=1")}>
                  <PlusIcon /> {t("addJob")}
                </CommandItem>
                {q ? null : (
                  <CommandItem value="action-search-jobs" onSelect={() => go("/jobs")}>
                    <SearchIcon /> {t("searchAllJobs")}
                  </CommandItem>
                )}
              </CommandGroup>
            ) : (
              <CommandGroup heading={t("actions")}>
                <CommandItem value="action-search-q" onSelect={() => go(`/jobs?q=${encodeURIComponent(query.trim())}`)}>
                  <SearchIcon /> {t("searchJobsFor", { query: query.trim() })}
                </CommandItem>
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </CommandDialog>
    </>
  )
}
