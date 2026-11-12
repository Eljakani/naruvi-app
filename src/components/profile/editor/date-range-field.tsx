"use client"

import { useState } from "react"
import { motion, useReducedMotion } from "motion/react"
import { ArrowRightIcon, CalendarIcon, ChevronLeftIcon, ChevronRightIcon, XIcon } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { durationMonths, formatDateRange, formatDuration, parseDateRange, rangeError, type DateRange, type MonthYear } from "@/lib/date-range"
import { cn } from "@/lib/utils"
import { useTranslations } from "next-intl"

type Lang = "en" | "fr"


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

  const text = value === "present" ? tr("present") : current ? (current.month === null ? String(current.year) : `${short(lang, current.month)} ${current.year}`) : null

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
            aria-label={`${label}: ${text ?? tr("pick")}`}
            className={cn(
              "group flex h-10 w-full min-w-0 items-center gap-2 rounded-lg border bg-background px-3 text-start text-sm shadow-xs transition-[border-color,box-shadow] outline-none hover:border-foreground/25 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 data-[popup-open]:border-ring data-[popup-open]:ring-[3px] data-[popup-open]:ring-ring/30",
              value === "present" && "border-success/30 bg-success-soft",
            )}
          />
        }
      >
        <CalendarIcon className="size-4 shrink-0 text-muted-foreground" />
        <span className="grid min-w-0 flex-1 leading-tight">
          <span className="text-[10px] font-medium tracking-wide text-muted-foreground uppercase">{label}</span>
          <span className={cn("truncate", text ? "font-medium" : "text-muted-foreground")}>
            {value === "present" ? (
              <span className="inline-flex items-center gap-1.5 text-success">
                <span className="size-1.5 rounded-full bg-success" /> {tr("present")}
              </span>
            ) : (
              text ?? tr("pick")
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
            placeholder={tr("typeHint")}
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
            {tr("yearOnly")} · {viewYear}
          </button>
          {present ? (
            <button type="button" onClick={() => choose("present")} className={cn("inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-xs font-medium text-success transition-colors hover:bg-success-soft", value === "present" && "bg-success-soft")}>
              <span className="size-1.5 rounded-full bg-success" /> {tr("present")}
            </button>
          ) : null}
          {value ? (
            <button type="button" onClick={() => choose(null)} className="ms-auto inline-flex h-7 items-center gap-1 rounded-md px-2 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
              <XIcon className="size-3" /> {tr("clear")}
            </button>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  )
}

/**
 * Start → End as two month pickers. The range is stored once; every CV
 * language writes it in its own words.
 */
export function DateRangeField({ lang, value, onChange, label }: { lang: Lang; value: DateRange; onChange: (range: DateRange) => void; label?: string }) {
  const tr = useTranslations("dateRange")
  const months = durationMonths(value)
  const error = rangeError(value)
  const other: Lang = lang === "en" ? "fr" : "en"

  return (
    <div className="grid gap-2">
      <span className="text-sm font-medium">{label ?? tr("dates")}</span>
      <div className="grid items-center gap-2 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
        <MonthPicker label={tr("start")} lang={lang} value={value.start} onChange={(start) => onChange({ ...value, start: start === "present" ? null : start })} />
        <ArrowRightIcon className="hidden size-4 text-muted-foreground sm:block" aria-hidden />
        <MonthPicker label={tr("end")} lang={lang} value={value.end} present min={value.start} onChange={(end) => onChange({ ...value, end })} />
      </div>
      <p className={cn("flex flex-wrap items-center gap-x-2 text-xs", error ? "text-destructive" : "text-muted-foreground")} aria-live="polite">
        {error ? (
          error
        ) : value.start ? (
          <>
            {months ? <span className="rounded-full bg-muted px-2 py-0.5 font-medium text-foreground tabular-nums">{formatDuration(months, lang)}</span> : null}
            <span>{tr("onCv")}: {formatDateRange(value, lang)}</span>
            <span aria-hidden>·</span>
            <span>{formatDateRange(value, other)}</span>
          </>
        ) : (
          tr("fills")
        )}
      </p>
    </div>
  )
}

/** One month (or year), e.g. when a certification was issued. */
export function MonthField({ lang, label, value, onChange }: { lang: Lang; label: string; value: MonthYear | null; onChange: (value: MonthYear | null) => void }) {
  return (
    <div className="grid gap-2">
      <span className="text-sm font-medium">{label}</span>
      <MonthPicker label={label} lang={lang} value={value} onChange={(next) => onChange(next === "present" ? null : next)} />
    </div>
  )
}
