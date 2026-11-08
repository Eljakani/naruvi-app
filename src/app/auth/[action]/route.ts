import { NextRequest, NextResponse } from "next/server"
import { allowedAttempt, createOwner, hasOwner, newSession, owner, revokeSession, validSetup, rateLimit, resetLimit, validSession } from "@/server/auth/store"
import { hashPassword, verifyPassword, DUMMY_PASSWORD_HASH, AuthBusyError } from "@/server/auth/crypto"
import { authDestination } from "@/lib/auth-navigation"
import { authOrigin as origin, sameOrigin, cookieName, clientBucket } from "@/server/auth/policy"
const secure = (r: NextRequest) => origin(r).startsWith("https:")
const options = (r: NextRequest, maxAge: number) => ({ httpOnly: true, secure: secure(r), sameSite: "lax" as const, path: "/", maxAge })
const go = (r: NextRequest, path: string) => {
  const response = NextResponse.redirect(new URL(path, origin(r)), 303)
  response.headers.set("Cache-Control", "no-store")
  response.headers.set("Referrer-Policy", "no-referrer")
  return response
}
export async function GET(request: NextRequest, { params }: { params: Promise<{ action: string }> }) {
  const { action } = await params
  if (action === "session") {
    const active = await validSession(request.cookies.get(cookieName("session", origin(request)))?.value || "", false)
    return new NextResponse(null, { status: active ? 204 : 401, headers: { "Cache-Control": "no-store" } })
  }
  if (action !== "setup") return new Response(null, { status: ["login", "register", "logout"].includes(action) ? 405 : 404, headers: { Allow: "POST" } })
  if (await validSession(request.cookies.get(cookieName("session", origin(request)))?.value || "", false)) return go(request, "/")
  if (await hasOwner()) {
    const response = go(request, "/login?notice=already-configured")
    response.cookies.set(cookieName("setup", origin(request)), "", options(request, 0))
    return response
  }
  const budget = await rateLimit(`setup:${clientBucket(request)}`, 20, 60)
  if (!budget.allowed) return NextResponse.json({ error: "Too many setup requests. Try again shortly." }, { status: 429, headers: { "Retry-After": String(budget.retry), "Cache-Control": "no-store" } })
  const value = request.nextUrl.searchParams.get("token") || ""
  const valid = value.length === 64 && await validSetup(value)
  const response = go(request, valid ? "/login" : "/login?notice=setup-expired")
  response.cookies.set(cookieName("setup", origin(request)), valid ? value : "", options(request, valid ? 3600 : 0))
  return response
}
async function post(request: NextRequest, { params }: { params: Promise<{ action: string }> }) {
  if (!sameOrigin(request)) return new Response("Invalid origin", { status: 403 })
  const json = request.headers.get("accept")?.includes("application/json")
  const reject = (error: string, status = 400) => json
    ? NextResponse.json({ error }, { status, headers: { "Cache-Control": "no-store" } })
    : go(request, "/login?error=1")
  const { action } = await params
  if (action === "logout") {
    await revokeSession(request.cookies.get(cookieName("session", origin(request)))?.value || "")
    const response = go(request, "/login")
    response.cookies.set(cookieName("session", origin(request)), "", options(request, 0))
    response.cookies.set(cookieName("setup", origin(request)), "", options(request, 0))
    return response
  }
  if (!["register", "login"].includes(action)) return new Response(null, { status: 404 })
  if (await validSession(request.cookies.get(cookieName("session", origin(request)))?.value || "", false)) return json
    ? NextResponse.json({ ok: true, redirect: "/" }, { headers: { "Cache-Control": "no-store" } }) : go(request, "/")
  const client = await rateLimit(`credentials:${clientBucket(request)}`, 5, 60)
  if (!client.allowed || !await allowedAttempt()) return NextResponse.json({ error: "Too many attempts. Please wait before trying again." }, { status: 429, headers: { "Retry-After": String(client.allowed ? 60 : client.retry), "Cache-Control": "no-store" } })
  if (Number(request.headers.get("content-length")) > 4096) return new Response(null, { status: 413 })
  if (!request.headers.get("content-type")?.startsWith("application/x-www-form-urlencoded")) return new Response(null, { status: 415 })
  const reader = request.body?.getReader()
  const chunks: Uint8Array[] = []
  let length = 0
  const deadline = Date.now() + 10_000
  if (reader) while (true) {
    let timer: ReturnType<typeof setTimeout> | undefined
    const chunk = await Promise.race([
      reader.read(),
      new Promise<null>(resolve => { timer = setTimeout(() => resolve(null), Math.max(0, deadline - Date.now())) }),
    ]).finally(() => clearTimeout(timer))
    if (!chunk) { void reader.cancel(); return reject("The request took too long. Please try again.", 408) }
    const { done, value } = chunk
    if (done) break
    length += value.byteLength
    if (length > 4096) { await reader.cancel(); return new Response(null, { status: 413 }) }
    chunks.push(value)
  }
  const body = Buffer.concat(chunks).toString("utf8")
  const form = new URLSearchParams(body)
  if (["username", "password", "confirm", "next"].some(key => form.getAll(key).length > 1)) return reject("Invalid form submission.")
  const username = form.get("username")?.trim() || ""
  const destination = action === "register" ? "/setup" : authDestination(form.get("next"))
  const password = form.get("password") || ""
  const accountKey = `account:${username.toLowerCase()}`
  if (username.length <= 64) {
    const accountLimit = await rateLimit(accountKey, 10, 900)
    if (!accountLimit.allowed) return NextResponse.json({ error: "Too many attempts. Please wait before trying again." }, { status: 429, headers: { "Retry-After": String(accountLimit.retry), "Cache-Control": "no-store" } })
  }
  if (!/^[a-zA-Z0-9_-]{3,64}$/.test(username) || password.length < 16 || password.length > 128) return reject("Check your username and password, then try again.")
  let verifiedHash = ""
  if (action === "register") {
    const secret = request.cookies.get(cookieName("setup", origin(request)))?.value || ""
    if (await hasOwner()) return reject("This workspace already has an owner. Reload the page to sign in.", 409)
    if (!await validSetup(secret)) return reject("This setup link expired or was replaced. Get a new one with naruvi setup-link (or npm run auth:setup-link).", 403)
    if (form.get("confirm") !== password) return reject("The passwords don’t match. Please check the confirmation.")
    verifiedHash = await hashPassword(password)
    if (!await createOwner(secret, username, verifiedHash)) return reject("Setup was already completed. Reload this page to sign in.", 409)
  } else {
    const account = await owner()
    verifiedHash = account?.password || ""
    // Equal-cost verification for unknown usernames.
    if (!await verifyPassword(password, account?.password || DUMMY_PASSWORD_HASH) || !account || account.username !== username) return reject("The username or password is incorrect.", 401)
  }
  await resetLimit(accountKey)
  await revokeSession(request.cookies.get(cookieName("session", origin(request)))?.value || "")
  const response = json ? NextResponse.json({ ok: true, redirect: destination }, { headers: { "Cache-Control": "no-store" } }) : go(request, destination)
  response.cookies.set(cookieName("session", origin(request)), await newSession(verifiedHash), options(request, 7 * 86400))
  response.cookies.set(cookieName("setup", origin(request)), "", options(request, 0))
  return response
}

export async function POST(request: NextRequest, context: { params: Promise<{ action: string }> }) {
  try { return await post(request, context) }
  catch (error) {
    if (error instanceof AuthBusyError) return NextResponse.json({ error: "Naruvi is handling other sign-ins. Try again shortly." }, { status: 503, headers: { "Retry-After": "5", "Cache-Control": "no-store" } })
    console.error("[auth] Request failed; check database connectivity and NARUVI_URL configuration.")
    return NextResponse.json({ error: "Sign-in is temporarily unavailable." }, { status: 503, headers: { "Cache-Control": "no-store" } })
  }
}
