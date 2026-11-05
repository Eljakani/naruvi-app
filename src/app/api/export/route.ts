import { exportAll } from "@/server/settings/service"

/** Full data export (JSON). Local-only app: the user downloads their own data. */
export async function GET() {
  const data = await exportAll()
  const stamp = new Date().toISOString().slice(0, 10)
  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="naruvi-export-${stamp}.json"`,
      "cache-control": "no-store",
    },
  })
}
