/**
 * Minimal iCalendar (RFC 5545) writer for next steps. Pure, no dependencies.
 * All-day events on the due date, so time zones never shift a deadline.
 */
export type CalendarEvent = { uid: string; date: Date; summary: string; description?: string; url?: string; updatedAt: Date }

const escape = (text: string) => text.replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n")
const day = (date: Date) => `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, "0")}${String(date.getDate()).padStart(2, "0")}`
const stamp = (date: Date) => date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "")

/** Lines longer than 75 octets continue on the next line, starting with a space. */
export function fold(line: string): string {
  const bytes = new TextEncoder().encode(line)
  if (bytes.length <= 75) return line
  const parts: string[] = []
  let current = ""
  let size = 0
  for (const char of line) {
    const length = new TextEncoder().encode(char).length
    if (size + length > (parts.length ? 74 : 75)) {
      parts.push(current)
      current = ""
      size = 0
    }
    current += char
    size += length
  }
  parts.push(current)
  return parts.join("\r\n ")
}

export function calendar(name: string, events: CalendarEvent[]): string {
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Naruvi//Job search//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH", `X-WR-CALNAME:${escape(name)}`, "REFRESH-INTERVAL;VALUE=DURATION:PT1H", "X-PUBLISHED-TTL:PT1H"]
  for (const event of events) {
    const end = new Date(event.date.getFullYear(), event.date.getMonth(), event.date.getDate() + 1)
    lines.push(
      "BEGIN:VEVENT",
      `UID:${event.uid}`,
      `DTSTAMP:${stamp(event.updatedAt)}`,
      `DTSTART;VALUE=DATE:${day(event.date)}`,
      `DTEND;VALUE=DATE:${day(end)}`,
      `SUMMARY:${escape(event.summary)}`,
      ...(event.description ? [`DESCRIPTION:${escape(event.description)}`] : []),
      ...(event.url ? [`URL:${event.url}`] : []),
      "TRANSP:TRANSPARENT",
      "END:VEVENT",
    )
  }
  lines.push("END:VCALENDAR")
  return lines.map(fold).join("\r\n") + "\r\n"
}
