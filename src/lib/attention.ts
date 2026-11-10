/**
 * Keeping many applications organised: next-step due dates and the
 * "Needs attention" list. Pure, shared by server and client, unit-tested.
 */
import type { Status } from "./stages"

const DAY = 86_400_000
const startOfDay = (time: number) => {
  const date = new Date(time)
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
}

/** Whole days from today to the due date (negative when overdue). */
export function daysUntil(due: Date, now: number) {
  return Math.round((startOfDay(due.getTime()) - startOfDay(now)) / DAY)
}

/** Words for due dates; the UI passes its translator (`attention.due.*`), English otherwise. */
export type DueWords = (key: "overdue" | "today" | "tomorrow" | "inDays", values: { days: number }) => string
const english: DueWords = (key, { days }) => (key === "overdue" ? `${days} day${days === 1 ? "" : "s"} overdue` : key === "inDays" ? `in ${days} days` : key)

export function dueLabel(due: Date, now: number, words: DueWords = english, locale?: string) {
  const days = daysUntil(due, now)
  if (days < 0) return words("overdue", { days: -days })
  if (days === 0) return words("today", { days })
  if (days === 1) return words("tomorrow", { days })
  if (days < 7) return words("inDays", { days })
  return due.toLocaleDateString(locale, { day: "numeric", month: "short" })
}

export type DueTone = "overdue" | "soon" | "later"
export const dueTone = (due: Date, now: number): DueTone => {
  const days = daysUntil(due, now)
  return days < 0 ? "overdue" : days <= 2 ? "soon" : "later"
}

/** Quick picks for a due date, as days from today. */
export const DUE_PRESETS = [1, 3, 7, 14] as const

/** End of the day `days` from now, so "today" is still due until midnight. */
export function dueIn(days: number, now: number) {
  const date = new Date(startOfDay(now) + days * DAY)
  date.setHours(18, 0, 0, 0)
  return date
}

export const CLOSED: Status[] = ["rejected", "withdrawn"]

/** Days without a reply before a sent application counts as gone quiet. */
export const QUIET_AFTER_DAYS = 14
/** Days a strong match can wait before it is flagged as not started. */
export const IDLE_AFTER_DAYS = 3
export const STRONG_FIT = 70

export type AttentionInput = {
  id: string
  title: string
  company: string
  logoPath: string | null
  status: Status
  fit: number | null
  nextStep: string
  nextStepDue: Date | null
  /** When it entered its current status. */
  since: Date
  archived: boolean
}

export type AttentionReason = "due" | "ready" | "quiet" | "strong-fit"
/** `message` is English (API); the UI words it from `reason`, `idleDays` and `fit`. */
export type AttentionItem = AttentionInput & { reason: AttentionReason; message: string; idleDays: number; urgency: number; action: "open" | "cv" | "archive" }

/**
 * What needs doing, most urgent first. One reason per application: a dated
 * next step wins, because the person already decided what to do.
 */
export function needsAttention(items: AttentionInput[], now: number): AttentionItem[] {
  const out: AttentionItem[] = []
  for (const item of items) {
    if (item.archived) continue
    const closed = CLOSED.includes(item.status)
    const idleDays = Math.floor((now - item.since.getTime()) / DAY)
    if (item.nextStepDue && !closed) {
      const days = daysUntil(item.nextStepDue, now)
      if (days <= 2) {
        out.push({ ...item, idleDays, reason: "due", message: `${item.nextStep || "Next step"} · ${dueLabel(item.nextStepDue, now)}`, urgency: 100 - days * 10, action: "open" })
        continue
      }
    }
    if (item.nextStepDue) continue
    if (item.status === "ready") {
      out.push({ ...item, idleDays, reason: "ready", message: idleDays >= 1 ? `Documents ready for ${idleDays} day${idleDays === 1 ? "" : "s"}; send it or set a date` : "Documents are ready to send", urgency: 60 + Math.min(idleDays, 20), action: "open" })
    } else if (item.status === "submitted" && idleDays >= QUIET_AFTER_DAYS) {
      out.push({ ...item, idleDays, reason: "quiet", message: `No news for ${idleDays} days; follow up or archive it`, urgency: 40 + Math.min(idleDays - QUIET_AFTER_DAYS, 30), action: "archive" })
    } else if (item.status === "analyzed" && (item.fit ?? 0) >= STRONG_FIT && idleDays >= IDLE_AFTER_DAYS) {
      out.push({ ...item, idleDays, reason: "strong-fit", message: `Strong fit (${item.fit}) waiting ${idleDays} days; draft the CV`, urgency: 20 + Math.min(idleDays, 20), action: "cv" })
    }
  }
  return out.sort((a, b) => b.urgency - a.urgency)
}
