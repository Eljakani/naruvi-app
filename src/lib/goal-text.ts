import type { useTranslations } from "next-intl"
import type { GoalCheck } from "@/lib/search-goals"

type T = ReturnType<typeof useTranslations<"goals">>

/** One goal check in the reader's language: codes become words, lists read "A, B or C". */
export function goalCheckText(check: GoalCheck, t: T, locale: string) {
  const m = check.msg
  const or = (items: string[]) => new Intl.ListFormat(locale, { type: "disjunction" }).format(items)
  const contract = (code: string) => (t.has(`contracts.${code}` as never) ? t(`contracts.${code}` as never) : code)
  const mode = (code: string) => t(`modes.${code}` as never)
  const country = (code?: string | null) => (code ? new Intl.DisplayNames([locale], { type: "region" }).of(code.toUpperCase()) ?? code : "")
  const month = (value?: string) => (value ? new Date(`${value}-01T12:00:00Z`).toLocaleDateString(locale, { month: "long", year: "numeric", timeZone: "UTC" }) : "")
  return t(`checks.${m.id}`, {
    contract: m.contract ? contract(m.contract) : "",
    wanted: or((m.wanted ?? []).map(contract)),
    mode: m.mode ? mode(m.mode) : "",
    modes: or((m.modes ?? []).map(mode)),
    where: m.where ?? "",
    places: or(m.places ?? []),
    country: country(m.country),
    hasCountry: m.country ? "yes" : "no",
    label: m.label ?? "",
    min: m.min == null ? "—" : String(m.min),
    max: m.max == null ? "—" : String(m.max),
    start: month(m.start),
    from: month(m.from),
  })
}
