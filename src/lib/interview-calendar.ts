import { z } from "zod"

export const interviewCalendarInput = z.object({
  applicationId: z.string().uuid(),
  messageId: z.string().uuid(),
  start: z.string().datetime(),
  duration: z.number().int().min(15).max(480),
  timeZone: z.string().min(1).max(100).refine((zone) => { try { new Intl.DateTimeFormat("en", { timeZone: zone }); return true } catch { return false } }, "Choose a valid time zone."),
  tentative: z.boolean(),
  location: z.string().trim().max(500).default(""),
})
export type InterviewCalendarInput = z.input<typeof interviewCalendarInput>

/** Resolve a wall-clock time in the explicitly selected IANA zone, independent of the server's zone. */
export function zonedInterviewStart(local: string, timeZone: string): string {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(local)) throw new Error("Choose the interview date and time.")
  const target = Date.parse(`${local}:00Z`)
  if (!Number.isFinite(target) || new Date(target).toISOString().slice(0, 16) !== local) throw new Error("Choose a valid date and time.")
  const formatter = new Intl.DateTimeFormat("sv-SE", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
  let instant = target
  for (let i = 0; i < 3; i++) {
    const shown = formatter.format(new Date(instant)).replace(" ", "T")
    const difference = target - Date.parse(`${shown}:00Z`)
    if (!difference) return new Date(instant).toISOString()
    instant += difference
  }
  throw new Error("That local time does not exist because of a clock change. Choose another time.")
}

export function shouldOfferInterviewCalendar(message: { direction: string; kind: string | null }, hasInterview: boolean): boolean {
  return hasInterview && message.direction === "out" && ["reply", "follow_up"].includes(message.kind ?? "")
}
