"use client"

import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { useTransition } from "react"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { cn } from "@/lib/utils"
import { useTranslations } from "next-intl"

const RANGES = ["24h", "7d", "30d", "all"] as const
const STATUSES = ["all", "failed", "running"] as const

/** Workflow, status and time range, kept in the URL so views can be shared and reloaded. */
export function RunFilters({ workflows, range, workflow, status }: { workflows: { value: string; label: string }[]; range: string; workflow?: string; status?: string }) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const [pending, startTransition] = useTransition()
  const t = useTranslations("runs.filters")
  const statuses = STATUSES.map((value) => ({ value, label: t(`status.${value}`) }))
  const go = (key: string, value: string | undefined) => {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    next.delete("before")
    const query = next.toString()
    startTransition(() => router.push(query ? `${pathname}?${query}` : pathname, { scroll: false }))
  }
  const items = [{ value: "all", label: t("allTasks") }, ...workflows]
  return (
    <div className={cn("flex flex-wrap items-center gap-2 transition-opacity", pending && "opacity-60")}>
      <Select items={items} value={workflow ?? "all"} onValueChange={(value) => go("workflow", value && value !== "all" ? value : undefined)}>
        <SelectTrigger aria-label={t("workflow")} className="w-56"><SelectValue /></SelectTrigger>
        <SelectContent>{items.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent>
      </Select>
      <Select items={statuses} value={status ?? "all"} onValueChange={(value) => go("status", value && value !== "all" ? value : undefined)}>
        <SelectTrigger aria-label={t("statusLabel")} className="w-36"><SelectValue /></SelectTrigger>
        <SelectContent>{statuses.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent>
      </Select>
      <ToggleGroup aria-label={t("range")} variant="outline" size="sm" value={[range]} onValueChange={(value) => value[0] && go("range", value[0] === "7d" ? undefined : value[0])}>
        {RANGES.map((value) => <ToggleGroupItem key={value} value={value}>{t(`ranges.${value}`)}</ToggleGroupItem>)}
      </ToggleGroup>
    </div>
  )
}
