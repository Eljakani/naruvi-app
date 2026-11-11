import { NaruviMark } from "@/components/naruvi-mark"
import { useTranslations } from "next-intl"

export function AuthLoading() {
  const t = useTranslations("auth")
  return <main className="grid min-h-svh place-items-center bg-background px-6 py-10 sm:py-16" role="status" aria-label={t("opening")} aria-busy="true">
    <div className="w-full max-w-sm space-y-6">
      <div className="flex items-center gap-3"><NaruviMark className="size-8" /><span className="naruvi-typing" aria-hidden="true"><i /><i /><i /></span><span className="text-sm text-muted-foreground">{t("openingEllipsis")}</span></div>
      <div aria-hidden="true" className="space-y-6 motion-safe:animate-pulse">
        <div className="space-y-3"><div className="h-7 w-4/5 rounded-md bg-muted" /><div className="h-4 w-full rounded bg-muted" /><div className="h-4 w-2/3 rounded bg-muted" /></div>
        <div className="space-y-5">{[0, 1, 2].map(i => <div key={i} className="space-y-2"><div className="h-12 rounded-lg border bg-muted/30" /><div className="h-3 w-3/5 rounded bg-muted" /></div>)}</div>
        <div className="h-12 rounded-lg bg-muted" />
      </div>
    </div>
  </main>
}
