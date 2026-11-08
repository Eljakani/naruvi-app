import { readAsset } from "@/server/assets/store"

/** Serves stored assets. Content-addressed, so they cache forever; SVGs are sandboxed. */
export async function GET(_request: Request, { params }: RouteContext<"/api/assets/[...path]">) {
  const { path } = await params
  const asset = await readAsset(path.join("/")).catch(() => null)
  if (!asset) return new Response("Not found", { status: 404 })
  return new Response(new Uint8Array(asset.buffer), {
    headers: {
      "content-type": asset.mime,
      "cache-control": "private, max-age=31536000, immutable",
      "x-content-type-options": "nosniff",
      "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
    },
  })
}
