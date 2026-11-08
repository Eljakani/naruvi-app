import { TerminalSquareIcon, RotateCwIcon } from "lucide-react"
import { CopyCommand } from "@/components/auth/copy-command"
import { redirect } from "next/navigation"
import { AuthSessionGuard } from "@/components/auth/auth-session-guard"
import { authDestination } from "@/lib/auth-navigation"
import { Suspense } from "react"
import { cookies } from "next/headers"
import { connection } from "next/server"
import { cookieName } from "@/server/auth/policy"
import { hasOwner, validSetup, validSession } from "@/server/auth/store"
import { AuthLoading } from "@/components/auth/auth-loading"
import { OwnerForm } from "@/components/auth/owner-form"
import { NaruviMark } from "@/components/naruvi-mark"

export const metadata = { title: "Sign in", robots: { index: false, follow: false }, referrer: "same-origin" }
export default function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string; next?: string; notice?: string }> }) {
  return <Suspense fallback={<AuthLoading />}><Login searchParams={searchParams} /></Suspense>
}
async function Login({ searchParams }: { searchParams: Promise<{ error?: string; next?: string; notice?: string }> }) {
  await connection()
  const query = await searchParams
  const destination = authDestination(query.next)
  const jar = await cookies()
  if (await validSession(jar.get(cookieName("session", process.env.NARUVI_URL || "http://localhost:3000"))?.value || "", false)) redirect(destination)
  const sessionCookie = jar.get(cookieName("session", process.env.NARUVI_URL || "http://localhost:3000"))?.value
  const notice = query.notice || (sessionCookie ? "session-expired" : undefined)
  const configured = await hasOwner()
  const setup = !configured && await validSetup(jar.get(cookieName("setup", process.env.NARUVI_URL || "http://localhost:3000"))?.value || "")
  const linkCommand = process.env.NARUVI_DEPLOYMENT === "installer" ? "naruvi setup-link" : "npm run auth:setup-link"

  return (
    <main className="grid min-h-svh place-items-center bg-background px-6 py-10 sm:py-16">
      <AuthSessionGuard guest destination={destination} />
      <section className="naruvi-auth-enter w-full max-w-sm space-y-6">
        <div className="space-y-2">
          <NaruviMark className="mb-4 size-12" />
          <h1 className="text-2xl font-semibold tracking-tight text-balance">{setup ? "Make this your workspace." : configured ? "Welcome back to Naruvi." : "Your workspace is waiting."}</h1>
          <p className="text-sm leading-relaxed text-muted-foreground">{setup ? "Create your owner account, then we’ll help you set up Naruvi." : configured ? "Sign in to pick up where you left off." : "Naruvi is installed. Create your owner account with the private setup link from your server."}</p>
        </div>
        {notice === "session-expired" ? <p role="status" className="rounded-lg border bg-muted/30 px-3 py-2.5 text-sm text-muted-foreground">Your session ended. Sign in to continue.</p> : notice === "already-configured" ? <p role="status" className="text-sm text-muted-foreground">This workspace is already set up. Sign in with your owner account.</p> : notice === "setup-expired" && !configured ? <p role="status" className="rounded-lg border bg-muted/30 px-3 py-2.5 text-sm text-muted-foreground">That setup link expired or was replaced. Get a new one below.</p> : null}
        {configured || setup ? <OwnerForm setup={setup} returnTo={destination} initialError={query.error ? "We couldn’t complete that request. Check your details and try again." : undefined} /> : <div className="space-y-4 rounded-xl border bg-muted/25 p-4">
          <div className="flex items-start gap-3"><TerminalSquareIcon aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-brand" /><div className="space-y-1"><p className="text-sm font-medium">Get your setup link</p><p className="text-sm leading-relaxed text-muted-foreground">Run this where Naruvi is installed, then open the link it prints. It works once and expires in an hour.</p></div></div>
          <CopyCommand command={linkCommand} />
          <a href="/login" className="flex min-h-10 items-center justify-between rounded-md px-2 text-sm font-medium transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring">I opened the link, check again<RotateCwIcon aria-hidden="true" className="size-4" /></a>
        </div>}
        <p className="text-center text-xs text-muted-foreground">Your career. Your workspace.</p>
      </section>
    </main>
  )
}
