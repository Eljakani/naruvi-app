import { calendarFeed, checkCalendarToken } from "@/server/integrations/calendar"

/** Private iCalendar feed of next steps. The token is the only credential, so it is checked in constant time. */
export async function GET(request: Request, { params }: RouteContext<"/api/calendar/[token]">) {
  const { token } = await params
  const name = token.replace(/\.ics$/, "")
  if (!/^[a-f0-9]{48}$/.test(name) || !(await checkCalendarToken(name))) return new Response("Not found", { status: 404 })
  const url = new URL(request.url)
  const body = await calendarFeed(url.origin)
  return new Response(body, {
    headers: {
      "content-type": "text/calendar; charset=utf-8",
      "content-disposition": `${url.searchParams.get("download") === "1" ? "attachment" : "inline"}; filename="naruvi.ics"`,
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
    },
  })
}
