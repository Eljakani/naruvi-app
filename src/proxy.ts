import { NextRequest, NextResponse } from "next/server"
import { authOrigin, sameOrigin, cookieName } from "@/server/auth/policy"
import { validSession } from "@/server/auth/store"
import { authDestination } from "@/lib/auth-navigation"

function baseHeaders(response: NextResponse, request: NextRequest) {
  response.headers.set("X-Content-Type-Options", "nosniff")
  response.headers.set("Permissions-Policy", "camera=(), microphone=(self), geolocation=()")
  try { if (authOrigin(request).startsWith("https:")) response.headers.set("Strict-Transport-Security", "max-age=63072000; includeSubDomains") } catch {}
  return response
}

function privateResponse(response: NextResponse, request: NextRequest) {
  baseHeaders(response, request)
  response.headers.set("Cache-Control", "private, no-store")
  response.headers.set("Referrer-Policy", "same-origin")
  response.headers.set("X-Frame-Options", "DENY")
  // Local Whisper: WebAssembly needs 'wasm-unsafe-eval' (no JS eval); the model downloads once from Hugging Face.
  response.headers.set("Content-Security-Policy", `default-src 'self'; script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' blob:${process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : ""}; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self' https://huggingface.co https://*.huggingface.co https://*.hf.co; worker-src 'self' blob:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'`)
  return response
}
export async function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname
  if (path.startsWith("/api/v1/") || /^\/api\/calendar\/[a-f0-9]{48}(\.ics)?$/.test(path)) return baseHeaders(NextResponse.next(), request)
  if (["/auth/setup", "/auth/login", "/auth/register", "/auth/logout", "/auth/session"].includes(path)) return privateResponse(NextResponse.next(), request)
  const sessionName = cookieName("session", authOrigin(request))
  const session = request.cookies.get(sessionName)?.value || ""
  const authenticated = await validSession(session, path !== "/login")
  if (path === "/login") {
    return privateResponse(authenticated ? NextResponse.redirect(new URL(authDestination(request.nextUrl.searchParams.get("next")), authOrigin(request))) : NextResponse.next(), request)
  }
  if (authenticated) {
    if (!["GET", "HEAD", "OPTIONS"].includes(request.method) && !sameOrigin(request)) return privateResponse(new NextResponse("Invalid origin", { status: 403 }), request)
    return privateResponse(NextResponse.next(), request)
  }
  if (path.startsWith("/api/")) return privateResponse(NextResponse.json({ error: "Sign in required" }, { status: 401 }), request)
  const target = new URL("/login", authOrigin(request))
  target.searchParams.set("next", authDestination(path + request.nextUrl.search))
  if (session) target.searchParams.set("notice", "session-expired")
  const response = privateResponse(NextResponse.redirect(target), request)
  if (session) response.cookies.set(sessionName, "", { httpOnly: true, secure: target.protocol === "https:", sameSite: "lax", path: "/", maxAge: 0 })
  return response
}
export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.png|apple-icon.png|brand/).*)"] }
