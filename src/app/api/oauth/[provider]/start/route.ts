import { cookies } from "next/headers"
import { isOAuthProvider } from "@/lib/oauth"
import { startOAuth } from "@/server/mail/oauth"

/** Sends you to Google or Microsoft to sign in; state and PKCE verifier wait in a short-lived cookie. */
export async function GET(request: Request, { params }: RouteContext<"/api/oauth/[provider]/start">) {
  const { provider } = await params
  if (!isOAuthProvider(provider)) return new Response("Not found", { status: 404 })
  const url = new URL(request.url)
  try {
    const flow = await startOAuth(provider, url.origin, url.searchParams.get("hint") ?? undefined)
    ;(await cookies()).set(`naruvi-oauth-${provider}`, `${flow.state}.${flow.verifier}`, { httpOnly: true, sameSite: "lax", secure: url.protocol === "https:", path: `/api/oauth/${provider}`, maxAge: 600 })
    return Response.redirect(flow.url, 302)
  } catch (error) {
    return Response.redirect(`${url.origin}/integrations?oauth=${encodeURIComponent(error instanceof Error ? error.message : "Sign-in failed")}`, 302)
  }
}
