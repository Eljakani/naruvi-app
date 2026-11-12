import { workBudget } from "@/server/auth/work-budget"
import { sameOrigin } from "@/server/auth/policy"
import { previewFingerprint, renderTemplatePreview } from "@/server/templates/service"

/** Renders a design (tokens in the body) with the person's latest CV, or the sample. */
export async function POST(request: Request) {
  const budget = await workBudget(request, "pdf-preview")
  if (budget.response) return budget.response
  try {
    const body = await budget.request!.json().catch(() => null)
    if (!body || typeof body !== "object") return new Response("Bad request", { status: 400 })
    try {
      const sample = Boolean((body as { sample?: boolean }).sample)
      const [{ buffer, pages }, source] = await Promise.all([renderTemplatePreview((body as { tokens?: unknown }).tokens ?? {}, sample, (body as { kind?: string }).kind === "letter" ? "letter" : "cv"), previewFingerprint(sample)])
      return new Response(new Uint8Array(buffer), { headers: { "content-type": "application/pdf", "cache-control": "no-store", "x-pages": String(pages), "x-preview-source": source } })
    } catch {
      return new Response("Invalid design", { status: 422 })
    }
  } finally { await budget.release!() }
}

/** The current preview fingerprint: cheap, so open previews can check whether what they show is still current. */
// No render, so it doesn't count against the preview budget.
export async function GET(request: Request) {
  if (!sameOrigin(request)) return Response.json({ error: "Forbidden" }, { status: 403 })
  return Response.json({ source: await previewFingerprint() }, { headers: { "cache-control": "no-store" } })
}
