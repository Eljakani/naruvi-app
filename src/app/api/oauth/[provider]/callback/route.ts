import { timingSafeEqual } from "node:crypto"
import { cookies } from "next/headers"
import { revalidatePath } from "next/cache"
import { isOAuthProvider } from "@/lib/oauth"
import { finishOAuth } from "@/server/mail/oauth"

/** Back from Google or Microsoft: check the state, exchange the code, connect the mailbox. */
export async function GET(request: Request, { params }: RouteContext<"/api/oauth/[provider]/callback">) {
  const { provider } = await params
  if (!isOAuthProvider(provider)) return new Response("Not found", { status: 404 })
  const url = new URL(request.url)
  const back = (message: string) => Response.redirect(`${url.origin}/integrations?oauth=${encodeURIComponent(message)}`, 302)
  const jar = await cookies()
  const saved = jar.get(`naruvi-oauth-${provider}`)?.value ?? ""
  jar.delete({ name: `naruvi-oauth-${provider}`, path: `/api/oauth/${provider}` })
  const [state, verifier] = saved.split(".")
  const returned = url.searchParams.get("state") ?? ""
  if (url.searchParams.get("error")) return back(url.searchParams.get("error_description") ?? "Sign-in was cancelled.")
  if (!state || !verifier || state.length !== returned.length || !timingSafeEqual(Buffer.from(state), Buffer.from(returned))) return back("The sign-in expired or didn’t match. Try again.")
  const code = url.searchParams.get("code")
  if (!code) return back("No authorization code came back.")
  try {
    const email = await finishOAuth(provider, { code, verifier, origin: url.origin })
    revalidatePath("/integrations")
    return back(`connected:${email}`)
  } catch (error) {
    return back(error instanceof Error ? error.message : "Sign-in failed.")
  }
}
