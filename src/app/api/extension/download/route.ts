import { connection } from "next/server"
import { extensionZip } from "@/server/integrations/extension-package"

/** The browser extension, set to this Naruvi's address. Signed-in only (see src/proxy.ts). */
export async function GET(request: Request) {
  await connection()
  const configured = process.env.NARUVI_URL?.trim()
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? "localhost:3000"
  const proto = request.headers.get("x-forwarded-proto") ?? (/^(localhost|127\.|\[::1\])/.test(host) ? "http" : "https")
  const server = configured && URL.canParse(configured) ? new URL(configured).origin : `${proto}://${host}`
  const zip = await extensionZip(server)
  return new Response(Buffer.from(zip), {
    headers: { "content-type": "application/zip", "content-disposition": 'attachment; filename="naruvi-extension.zip"', "cache-control": "private, no-store" },
  })
}
