"use client"

import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { useEffect, useRef, useState, useTransition } from "react"
import { Loader2Icon, SearchIcon, XIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { cn } from "@/lib/utils"

/** Change one URL parameter (and go back to page 1), keeping the others. */
function useUrlParam() {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const [pending, startTransition] = useTransition()
  const set = (changes: Record<string, string | undefined>) => {
    const next = new URLSearchParams(params)
    for (const [key, value] of Object.entries(changes)) {
      if (value) next.set(key, value)
      else next.delete(key)
    }
    next.delete("page")
    const query = next.toString()
    startTransition(() => router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false }))
  }
  return { params, set, pending }
}

/** Search box that updates `?q=` as you type (debounced). Press "/" to focus it. */
export function SearchBox({ placeholder, className }: { placeholder: string; className?: string }) {
  const { params, set, pending } = useUrlParam()
  const current = params.get("q") ?? ""
  const [value, setValue] = useState(current)
  const [synced, setSynced] = useState(current)
  const input = useRef<HTMLInputElement>(null)
  // Back/forward or a cleared filter changes the URL: follow it.
  if (current !== synced) {
    setSynced(current)
    setValue(current)
  }
  useEffect(() => {
    if (value === current) return
    const timer = setTimeout(() => set({ q: value.trim() || undefined }), 250)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only react to typing
  }, [value])
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement
      if (event.key === "/" && !/input|textarea|select/i.test(target.tagName) && !target.isContentEditable) {
        event.preventDefault()
        input.current?.focus()
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])
  return (
    <InputGroup className={cn("w-full sm:w-72", className)}>
      <InputGroupAddon>{pending ? <Loader2Icon className="animate-spin" /> : <SearchIcon />}</InputGroupAddon>
      <InputGroupInput ref={input} type="text" role="searchbox" enterKeyHint="search" aria-label={placeholder} placeholder={placeholder} value={value} onChange={(event) => setValue(event.target.value)} onKeyDown={(event) => event.key === "Escape" && setValue("")} />
      {value ? (
        <InputGroupAddon align="inline-end">
          <InputGroupButton size="icon-xs" aria-label="Clear search" onClick={() => setValue("")}>
            <XIcon />
          </InputGroupButton>
        </InputGroupAddon>
      ) : (
        <InputGroupAddon align="inline-end" className="hidden sm:flex">
          <kbd className="rounded border px-1 font-mono text-[11px] text-muted-foreground">/</kbd>
        </InputGroupAddon>
      )}
    </InputGroup>
  )
}

/** A select bound to one URL parameter; the first option means "no filter". */
export function UrlSelect({ name, label, options, className }: { name: string; label: string; options: { value: string; label: string }[]; className?: string }) {
  const { params, set } = useUrlParam()
  const value = params.get(name) ?? options[0].value
  return (
    <Select items={options} value={value} onValueChange={(next) => set({ [name]: next && next !== options[0].value ? next : undefined })}>
      <SelectTrigger aria-label={label} className={cn("w-40", value !== options[0].value && "border-foreground/30", className)}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

/** Clears every listed filter at once; hidden when none is set. */
export function ClearFilters({ names }: { names: string[] }) {
  const { params, set } = useUrlParam()
  if (!names.some((name) => params.get(name))) return null
  return (
    <Button variant="ghost" size="sm" onClick={() => set(Object.fromEntries(names.map((name) => [name, undefined])))}>
      <XIcon /> Clear
    </Button>
  )
}
