import { revisionPdf } from "@/server/documents/service"

export async function GET(request: Request, { params }: RouteContext<"/api/revisions/[id]/pdf">) {
  const { id } = await params
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response("Not found", { status: 404 })
  const query = new URL(request.url).searchParams
  const live = query.has("contact")
  const pdf = await revisionPdf(id, live)
  if (!pdf) return new Response("Not found", { status: 404 })
  const download = query.get("download") === "1"
  return new Response(new Uint8Array(pdf.buffer), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `${download ? "attachment" : "inline"}; filename="${pdf.name}"`,
      "cache-control": live ? "private, no-store" : "private, max-age=31536000, immutable",
      "x-content-type-options": "nosniff",
    },
  })
}
