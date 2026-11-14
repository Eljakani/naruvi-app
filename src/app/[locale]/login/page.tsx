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
import { getTranslations } from "next-intl/server"
import { LanguageSwitcher } from "@/components/language-switcher"

export async function generateMetadata() {
  return { title: (await getTranslations("auth"))("signIn"), robots: { index: false, follow: false }, referrer: "same-origin" as const }
}
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
  const t = await getTranslations("auth")
  const linkCommand = process.env.NARUVI_DEPLOYMENT === "installer" ? "naruvi setup-link" : "npm run auth:setup-link"

  return (
    <main className="grid min-h-svh place-items-center bg-background px-6 py-10 sm:py-16">
      <AuthSessionGuard guest destination={destination} />
      <section className="naruvi-auth-enter w-full max-w-sm space-y-6">
        <div className="space-y-2">
          <NaruviMark className="mb-4 size-12" />
          <h1 className="text-2xl font-semibold tracking-tight text-balance">{setup ? t("setupTitle") : configured ? t("welcomeBack") : t("waitingTitle")}</h1>
          <p className="text-sm leading-relaxed text-muted-foreground">{setup ? t("setupBody") : configured ? t("welcomeBody") : t("waitingBody")}</p>
        </div>
        {notice === "session-expired" && configured ? <p role="status" className="rounded-lg border bg-muted/30 px-3 py-2.5 text-sm text-muted-foreground">{t("sessionEnded")}</p> : notice === "already-configured" ? <p role="status" className="text-sm text-muted-foreground">{t("alreadyConfigured")}</p> : notice === "setup-expired" && !configured ? <p role="status" className="rounded-lg border bg-muted/30 px-3 py-2.5 text-sm text-muted-foreground">{t("setupExpired")}</p> : null}
        {configured || setup ? <OwnerForm setup={setup} returnTo={destination} initialError={query.error ? t("requestFailed") : undefined} /> : <div className="space-y-4 rounded-xl border bg-muted/25 p-4">
          <div className="flex items-start gap-3"><TerminalSquareIcon aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-brand" /><div className="space-y-1"><p className="text-sm font-medium">{t("getLink")}</p><p className="text-sm leading-relaxed text-muted-foreground">{t("getLinkBody")}</p></div></div>
          <CopyCommand command={linkCommand} />
          {/* A full request rechecks whether an owner has been created. */}
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a href="/login" className="flex min-h-10 items-center justify-between rounded-md px-2 text-sm font-medium transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring">{t("checkAgain")}<RotateCwIcon aria-hidden="true" className="size-4" /></a>
        </div>}
        <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground"><p>{t("tagline")}</p><LanguageSwitcher compact /></div>
      </section>
    </main>
  )
}
