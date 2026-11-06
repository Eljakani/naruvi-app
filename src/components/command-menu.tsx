"use client"

import { useRouter } from "next/navigation"
import { useEffect, useState, useTransition } from "react"
import { BriefcaseBusinessIcon, Building2Icon, FileTextIcon, LayoutDashboardIcon, LayoutTemplateIcon, PlusIcon, SearchIcon, SettingsIcon, SparklesIcon, UserIcon, UsersIcon, ActivityIcon, type LucideIcon } from "lucide-react"
import { quickSearchAction } from "@/app/(app)/search/actions"
import { Button } from "@/components/ui/button"
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator, CommandShortcut } from "@/components/ui/command"
import { Command } from "@/components/ui/command"

const PAGES: { label: string; href: string; icon: LucideIcon; keywords?: string }[] = [
  { label: "Dashboard", href: "/", icon: LayoutDashboardIcon, keywords: "home needs attention" },
  { label: "Applications", href: "/applications", icon: FileTextIcon, keywords: "board pipeline" },
  { label: "Archived applications", href: "/applications?show=archived", icon: FileTextIcon },
  { label: "Jobs", href: "/jobs", icon: BriefcaseBusinessIcon, keywords: "postings" },
  { label: "Companies", href: "/companies", icon: Building2Icon, keywords: "employers" },
  { label: "Contacts", href: "/contacts", icon: UsersIcon, keywords: "people recruiters hr managers spontaneous" },
  { label: "Profile", href: "/profile", icon: UserIcon, keywords: "experience facts" },
  { label: "Templates", href: "/templates", icon: LayoutTemplateIcon, keywords: "design themes" },
  { label: "Runs", href: "/runs", icon: ActivityIcon, keywords: "traces ai" },
  { label: "Settings", href: "/settings", icon: SettingsIcon, keywords: "model api key" },
  { label: "Setup guide", href: "/setup", icon: SparklesIcon, keywords: "onboarding start install first run" },
]

type Results = Awaited<ReturnType<typeof quickSearchAction>>

/** Ctrl/⌘ K: jump to any page, job, application or company. */
export function CommandMenu() {
  const router = useRouter()
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
  const pages = PAGES.filter((page) => !q || `${page.label} ${page.keywords ?? ""}`.toLowerCase().includes(q))
  const jobs = q ? results.jobs : []
  const companies = q ? results.companies : []

  return (
    <>
      <Button variant="outline" size="sm" className="w-full max-w-64 justify-start gap-2 text-muted-foreground" onClick={() => setOpen(true)}>
        <SearchIcon />
        <span className="flex-1 text-left">Search…</span>
        <kbd className="hidden rounded border px-1 font-mono text-[10px] sm:inline">Ctrl K</kbd>
      </Button>
      <CommandDialog className="sm:max-w-xl" open={open} onOpenChange={(value) => { setOpen(value); if (!value) setQuery("") }} title="Search" description="Jump to a page, job, application or company">
        <Command shouldFilter={false} value={selected} onValueChange={setSelected}>
          <CommandInput placeholder="Search jobs, companies and pages…" value={query} onValueChange={setQuery} />
          <CommandList>
            <CommandEmpty>{pending ? "Searching…" : "Nothing found."}</CommandEmpty>
            {jobs.length ? (
              <CommandGroup heading="Jobs and applications">
                {jobs.map((job) => (
                  <CommandItem key={job.id} value={`job-${job.id}`} onSelect={() => go(job.applicationId ? `/applications/${job.applicationId}` : `/jobs/${job.id}`)}>
                    <BriefcaseBusinessIcon />
                    <span className="truncate">{job.title}</span>
                    {job.company ? <span className="truncate text-muted-foreground">{job.company}</span> : null}
                    <CommandShortcut>{job.applicationId ? "Application" : "Job"}</CommandShortcut>
                  </CommandItem>
                ))}
              </CommandGroup>
            ) : null}
            {companies.length ? (
              <CommandGroup heading="Companies">
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
              <CommandGroup heading="Go to">
                {pages.map((page) => (
                  <CommandItem key={page.href} value={`page-${page.href}`} onSelect={() => go(page.href)}>
                    <page.icon />
                    {page.label}
                  </CommandItem>
                ))}
              </CommandGroup>
            ) : null}
            {!q || "add a new job".includes(q) ? (
              <CommandGroup heading="Actions">
                <CommandItem value="action-add-job" onSelect={() => go("/jobs/new")}>
                  <PlusIcon /> Add a job
                </CommandItem>
                {q ? null : (
                  <CommandItem value="action-search-jobs" onSelect={() => go("/jobs")}>
                    <SearchIcon /> Search all jobs
                  </CommandItem>
                )}
              </CommandGroup>
            ) : (
              <CommandGroup heading="Actions">
                <CommandItem value="action-search-q" onSelect={() => go(`/jobs?q=${encodeURIComponent(query.trim())}`)}>
                  <SearchIcon /> Search jobs for “{query.trim()}”
                </CommandItem>
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </CommandDialog>
    </>
  )
}
