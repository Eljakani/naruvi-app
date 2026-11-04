import { revisionPdf } from "@/server/documents/service"

export async function GET(request: Request, { params }: RouteContext<"/api/revisions/[id]/pdf">) {
  const { id } = await params
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response("Not found", { status: 404 })
  const pdf = await revisionPdf(id)
  if (!pdf) return new Response("Not found", { status: 404 })
  const download = new URL(request.url).searchParams.get("download") === "1"
  return new Response(new Uint8Array(pdf.buffer), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `${download ? "attachment" : "inline"}; filename="${pdf.name}"`,
      // Revisions are immutable, so a revision's PDF never changes.
      "cache-control": "private, max-age=31536000, immutable",
      "x-content-type-options": "nosniff",
    },
  })
}
