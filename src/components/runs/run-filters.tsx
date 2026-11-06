"use client"

import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { useTransition } from "react"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { cn } from "@/lib/utils"

const RANGES = [
  { value: "24h", label: "24 h" },
  { value: "7d", label: "7 days" },
  { value: "30d", label: "30 days" },
  { value: "all", label: "All" },
]
const STATUSES = [
  { value: "all", label: "Any status" },
  { value: "failed", label: "Failed" },
  { value: "running", label: "Running" },
]

/** Workflow, status and time range, kept in the URL so views can be shared and reloaded. */
export function RunFilters({ workflows, range, workflow, status }: { workflows: { value: string; label: string }[]; range: string; workflow?: string; status?: string }) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const [pending, startTransition] = useTransition()
  const go = (key: string, value: string | undefined) => {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    next.delete("before")
    const query = next.toString()
    startTransition(() => router.push(query ? `${pathname}?${query}` : pathname, { scroll: false }))
  }
  const items = [{ value: "all", label: "All workflows" }, ...workflows]
  return (
    <div className={cn("flex flex-wrap items-center gap-2 transition-opacity", pending && "opacity-60")}>
      <Select items={items} value={workflow ?? "all"} onValueChange={(value) => go("workflow", value && value !== "all" ? value : undefined)}>
        <SelectTrigger aria-label="Workflow" className="w-56"><SelectValue /></SelectTrigger>
        <SelectContent>{items.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent>
      </Select>
      <Select items={STATUSES} value={status ?? "all"} onValueChange={(value) => go("status", value && value !== "all" ? value : undefined)}>
        <SelectTrigger aria-label="Status" className="w-36"><SelectValue /></SelectTrigger>
        <SelectContent>{STATUSES.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent>
      </Select>
      <ToggleGroup aria-label="Time range" variant="outline" size="sm" value={[range]} onValueChange={(value) => value[0] && go("range", value[0] === "7d" ? undefined : value[0])}>
        {RANGES.map((item) => <ToggleGroupItem key={item.value} value={item.value}>{item.label}</ToggleGroupItem>)}
      </ToggleGroup>
    </div>
  )
}
