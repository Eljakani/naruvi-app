import { timingSafeEqual } from "node:crypto"
import { revalidatePath } from "next/cache"
import { cookies } from "next/headers"
import { saveResendAccount } from "@/server/mail/account"
import { finishResendOAuth, readResendOAuthFlow, resendOAuthCookie, resendOAuthPath } from "@/server/mail/resend-oauth"

export async function GET(request: Request) {
  const url = new URL(request.url)
  let origin = url.origin
  const back = (message: string) => {
    const target = new URL("/integrations", origin)
    target.searchParams.set("oauth", message)
    target.hash = "email"
    return Response.redirect(target, 303)
  }
  const jar = await cookies()
  const cookie = jar.get(resendOAuthCookie)?.value
  jar.delete({ name: resendOAuthCookie, path: resendOAuthPath })
  if (!cookie) return back("Resend sign-in expired. Try again.")
  try {
    const flow = readResendOAuthFlow(cookie)
    origin = new URL(flow.redirectUri).origin
    const expected = Buffer.from(flow.state)
    const returned = Buffer.from(url.searchParams.get("state") ?? "")
    if (flow.expiresAt <= Date.now() || expected.length !== returned.length || !timingSafeEqual(expected, returned)) {
      return back("Resend sign-in expired or didn’t match. Try again.")
    }
    if (url.searchParams.has("error")) return back("Resend sign-in was declined or cancelled.")
    const code = url.searchParams.get("code")
    if (!code) return back("Resend didn’t return an authorization code.")
    const credential = await finishResendOAuth(flow, code)
    await saveResendAccount({ ...flow.addresses, apiKey: "" }, credential)
    revalidatePath("/integrations")
    revalidatePath("/applications")
    return back(`connected:${flow.addresses.email}`)
  } catch {
    return back("Couldn’t connect Resend. Check the selected team and try again.")
  }
}
