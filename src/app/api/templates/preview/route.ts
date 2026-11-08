import { workBudget } from "@/server/auth/work-budget"
import { renderTemplatePreview } from "@/server/templates/service"

/** Renders a design (tokens in the body) with the person's latest CV, or the sample. */
export async function POST(request: Request) {
  const budget = await workBudget(request, "pdf-preview")
  if (budget.response) return budget.response
  try {
    const body = await budget.request!.json().catch(() => null)
    if (!body || typeof body !== "object") return new Response("Bad request", { status: 400 })
    try {
      const { buffer, pages } = await renderTemplatePreview((body as { tokens?: unknown }).tokens ?? {}, Boolean((body as { sample?: boolean }).sample), (body as { kind?: string }).kind === "letter" ? "letter" : "cv")
      return new Response(new Uint8Array(buffer), { headers: { "content-type": "application/pdf", "cache-control": "no-store", "x-pages": String(pages) } })
    } catch {
      return new Response("Invalid design", { status: 422 })
    }
  } finally { await budget.release!() }
}
