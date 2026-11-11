"use client"

import { useState } from "react"
import { motion, useReducedMotion } from "motion/react"
import { ArrowRightIcon, CalendarIcon, ChevronLeftIcon, ChevronRightIcon, PenLineIcon, XIcon } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { durationMonths, formatDateRange, formatDuration, parseDateRange, rangeError, type DateRange, type MonthYear } from "@/lib/date-range"
import { cn } from "@/lib/utils"
import { useTranslations } from "next-intl"

type Lang = "en" | "fr"

const T = {
  en: { start: "Start", end: "End", present: "Present", yearOnly: "Year only", clear: "Clear", type: "Or type: mar 2023, 03/2023, 2019", pick: "Pick a month", onCv: "On the CV", fills: "Fills the French version too", stillHere: "Still there? Choose Present." },
  fr: { start: "Début", end: "Fin", present: "Aujourd’hui", yearOnly: "Année seule", clear: "Effacer", type: "Ou tapez : mars 2023, 03/2023, 2019", pick: "Choisir un mois", onCv: "Sur le CV", fills: "Remplit aussi la version anglaise", stillHere: "Vous y êtes encore ? Choisissez Aujourd’hui." },
} as const

const SHORT: Record<Lang, string[]> = {
  en: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
  fr: ["Janv", "Févr", "Mars", "Avr", "Mai", "Juin", "Juil", "Août", "Sept", "Oct", "Nov", "Déc"],
}
const short = (lang: Lang, month: number) => SHORT[lang][month]

/**
 * One button per date. It opens a year header and a 3×4 month grid: one click
 * for the month, the arrows for the year. You can also type the date.
 */
function MonthPicker({ value, onChange, lang, label, present, min }: {
  value: MonthYear | "present" | null
  onChange: (value: MonthYear | "present" | null) => void
  lang: Lang
  label: string
  /** Offer "Present" (end date only). */
  present?: boolean
  /** Months before this are greyed out (the end can't come before the start). */
  min?: MonthYear | null
}) {
  const tr = useTranslations("dateRange")
  const t = T[lang]
  const thisYear = new Date().getFullYear()
  const current = value && value !== "present" ? value : null
  const [open, setOpen] = useState(false)
  const [viewYear, setViewYear] = useState(current?.year ?? min?.year ?? thisYear)
  const [typed, setTyped] = useState("")
  const reduce = useReducedMotion()

  const choose = (next: MonthYear | "present" | null) => {
    onChange(next)
    setOpen(false)
    setTyped("")
  }
  const before = (year: number, month: number) => Boolean(min && (year < min.year || (year === min.year && min.month !== null && month < min.month)))
  const typedPoint = typed.trim() ? parseDateRange(typed)?.start ?? null : null

  const text = value === "present" ? t.present : current ? (current.month === null ? String(current.year) : `${short(lang, current.month)} ${current.year}`) : null

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (next) setViewYear(current?.year ?? min?.year ?? thisYear)
      }}
    >
      <PopoverTrigger
        render={
          <button
            type="button"
            aria-label={`${label}: ${text ?? t.pick}`}
            className={cn(
              "group flex h-10 w-full min-w-0 items-center gap-2 rounded-lg border bg-background px-3 text-start text-sm shadow-xs transition-[border-color,box-shadow] outline-none hover:border-foreground/25 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 data-[popup-open]:border-ring data-[popup-open]:ring-[3px] data-[popup-open]:ring-ring/30",
              value === "present" && "border-emerald-200 bg-emerald-50/50 dark:border-emerald-900 dark:bg-emerald-950/20",
            )}
          />
        }
      >
        <CalendarIcon className="size-4 shrink-0 text-muted-foreground" />
        <span className="grid min-w-0 flex-1 leading-tight">
          <span className="text-[10px] font-medium tracking-wide text-muted-foreground uppercase">{label}</span>
          <span className={cn("truncate", text ? "font-medium" : "text-muted-foreground")}>
            {value === "present" ? (
              <span className="inline-flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400">
                <span className="size-1.5 rounded-full bg-emerald-500" /> {t.present}
              </span>
            ) : (
              text ?? t.pick
            )}
          </span>
        </span>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-68 gap-2 p-2">
        <form
          onSubmit={(event) => {
            event.preventDefault()
            if (typedPoint) choose(typedPoint)
          }}
        >
          <Input
            autoFocus
            value={typed}
            onChange={(event) => {
              setTyped(event.target.value)
              const point = parseDateRange(event.target.value)?.start
              if (point) setViewYear(point.year)
            }}
            placeholder={t.type}
            aria-label={`${label}, typed`}
            className="h-8 text-xs"
          />
        </form>
        <div className="flex items-center justify-between px-1">
          <button type="button" aria-label={tr("previousYear")} onClick={() => setViewYear(viewYear - 1)} disabled={viewYear <= 1970} className="grid size-7 place-content-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-30">
            <ChevronLeftIcon className="size-4" />
          </button>
          <motion.span key={viewYear} initial={reduce ? false : { opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.15 }} className="text-sm font-semibold tabular-nums">
            {viewYear}
          </motion.span>
          <button type="button" aria-label={tr("nextYear")} onClick={() => setViewYear(viewYear + 1)} disabled={viewYear >= thisYear + 5} className="grid size-7 place-content-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-30">
            <ChevronRightIcon className="size-4" />
          </button>
        </div>
        <div className="grid grid-cols-3 gap-1" role="grid" aria-label={`${label}, ${viewYear}`}>
          {Array.from({ length: 12 }, (_, month) => {
            const selected = current?.year === viewYear && current.month === month
            const hinted = typedPoint?.year === viewYear && typedPoint.month === month
            const disabled = before(viewYear, month)
            const now = viewYear === thisYear && month === new Date().getMonth()
            return (
              <button
                key={month}
                type="button"
                disabled={disabled}
                aria-pressed={selected}
                onClick={() => choose({ year: viewYear, month })}
                className={cn(
                  "relative h-9 rounded-md text-sm transition-colors disabled:pointer-events-none disabled:opacity-30",
                  selected ? "bg-primary font-medium text-primary-foreground" : hinted ? "bg-muted ring-1 ring-ring" : "hover:bg-muted",
                )}
              >
                {short(lang, month)}
                {now && !selected ? <span className="absolute bottom-1 left-1/2 size-1 -translate-x-1/2 rounded-full bg-primary" aria-hidden /> : null}
              </button>
            )
          })}
        </div>
        <div className="flex items-center gap-1 border-t pt-2">
          <button type="button" onClick={() => choose({ year: viewYear, month: null })} disabled={before(viewYear, 11)} className={cn("h-7 rounded-md px-2 text-xs transition-colors hover:bg-muted disabled:opacity-30", current?.year === viewYear && current.month === null && "bg-muted font-medium")}>
            {t.yearOnly} · {viewYear}
          </button>
          {present ? (
            <button type="button" onClick={() => choose("present")} className={cn("inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-xs font-medium text-emerald-700 transition-colors hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-950/40", value === "present" && "bg-emerald-50 dark:bg-emerald-950/40")}>
              <span className="size-1.5 rounded-full bg-emerald-500" /> {t.present}
            </button>
          ) : null}
          {value ? (
            <button type="button" onClick={() => choose(null)} className="ms-auto inline-flex h-7 items-center gap-1 rounded-md px-2 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
              <XIcon className="size-3" /> {t.clear}
            </button>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  )
}

/**
 * Start → End as two month pickers. Writes the dates in English and French at
 * once, in the same CV style. Text it can't read ("Summer 2020") stays
 * editable as free text.
 */
export function DateRangeField({ id, lang, value, onChange }: { id: string; lang: Lang; value: string; onChange: (text: Partial<Record<Lang, string>>) => void }) {
  const tr = useTranslations("dateRange")
  const t = T[lang]
  const parsed = parseDateRange(value)
  const [freeText, setFreeText] = useState(parsed === null)
  const range: DateRange = parsed ?? { start: null, end: null }
  const set = (next: DateRange) => onChange({ en: formatDateRange(next, "en"), fr: formatDateRange(next, "fr") })
  const months = durationMonths(range)
  const error = rangeError(range)
  const other: Lang = lang === "en" ? "fr" : "en"

  return (
    <div className="grid gap-2">
      <div className="flex items-center justify-between gap-2">
        {freeText ? <label htmlFor={id} className="text-sm font-medium">{tr("dates")}</label> : <span className="text-sm font-medium">{tr("dates")}</span>}
        <button type="button" onClick={() => setFreeText(!freeText)} className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground">
          {freeText ? <><CalendarIcon className="size-3" /> {tr("calendar")}</> : <><PenLineIcon className="size-3" /> {tr("type")}</>}
        </button>
      </div>
      {freeText ? (
        <>
          <Input id={id} value={value} onChange={(event) => onChange({ [lang]: event.target.value })} placeholder={lang === "en" ? "Feb. 2024 – Present" : "févr. 2024 – aujourd’hui"} />
          {parsed === null && value.trim() ? <p className="text-xs text-muted-foreground">{tr("asIs")}</p> : null}
        </>
      ) : (
        <>
          <div className="grid items-center gap-2 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
            <MonthPicker label={t.start} lang={lang} value={range.start} onChange={(start) => set({ ...range, start: start === "present" ? null : start })} />
            <ArrowRightIcon className="hidden size-4 text-muted-foreground sm:block" aria-hidden />
            <MonthPicker label={t.end} lang={lang} value={range.end} present min={range.start} onChange={(end) => set({ ...range, end })} />
          </div>
          <p className={cn("flex flex-wrap items-center gap-x-2 text-xs", error ? "text-destructive" : "text-muted-foreground")} aria-live="polite">
            {error ? (
              error
            ) : range.start ? (
              <>
                {months ? <span className="rounded-full bg-muted px-2 py-0.5 font-medium text-foreground tabular-nums">{formatDuration(months, lang)}</span> : null}
                <span>{t.onCv}: {formatDateRange(range, lang)}</span>
                <span aria-hidden>·</span>
                <span>{formatDateRange(range, other)}</span>
              </>
            ) : (
              t.fills
            )}
          </p>
        </>
      )}
    </div>
  )
}
