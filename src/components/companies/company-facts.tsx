"use client"

import { motion, useReducedMotion } from "motion/react"
import { useRouter } from "next/navigation"
import { BuildingIcon, CalendarIcon, ExternalLinkIcon, FactoryIcon, HashIcon, MapPinIcon, NetworkIcon, RefreshCwIcon, TrendingUpIcon, UsersIcon } from "lucide-react"
import { toast } from "sonner"
import { refreshCompanyProfileAction } from "@/app/[locale]/(app)/companies/actions"
import ParticleButton from "@/components/kokonutui/particle-button"
import { Badge } from "@/components/ui/badge"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import type { CompanyProfile } from "@/server/companies/profile"
import { useLocale, useTranslations } from "next-intl"

// Fact labels come from the server in English; known ones get an icon and a translated label.
const FACTS = {
  Employees: ["employees", UsersIcon], "Staff (France)": ["staffFr", UsersIcon], Size: ["size", BuildingIcon], Founded: ["founded", CalendarIcon], Registered: ["registered", CalendarIcon],
  Headquarters: ["headquarters", MapPinIcon], "Head office": ["headOffice", MapPinIcon], Industry: ["industry", FactoryIcon], Parent: ["parent", NetworkIcon], Ticker: ["ticker", TrendingUpIcon], SIREN: ["siren", HashIcon],
} as const satisfies Record<string, readonly [string, React.ElementType]>

/** Public facts about the company as small tiles, with where they came from. */
export function CompanyFacts({ companyId, name, profile, enabled }: { companyId: string; name: string; profile: CompanyProfile | null; enabled: boolean }) {
  const router = useRouter()
  const reduce = useReducedMotion()
  const t = useTranslations("companyFacts")
  const locale = useLocale()
  const refresh = async () => {
    const result = await refreshCompanyProfileAction(companyId)
    if (!result.ok) {
      toast.error(result.message)
      throw new Error(result.message)
    }
    router.refresh()
  }
  const facts = profile?.facts ?? []
  return (
    <Card className="@container h-fit">
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription className="text-xs">
          {profile?.sources.length
            ? t("from", { sources: new Intl.ListFormat(locale).format(profile.sources.map((source) => source.name)), date: new Date(profile.fetchedAt).toLocaleDateString(locale, { day: "numeric", month: "short" }) })
            : enabled
              ? t("noMatch", { name })
              : t("off")}
        </CardDescription>
        {enabled ? (
          <CardAction>
            <ParticleButton variant="ghost" size="sm" onClick={refresh} pendingLabel={t("lookingUp")} successLabel={t("updated")} errorLabel={t("retry")} aria-label={t("again")}>
              <RefreshCwIcon />
            </ParticleButton>
          </CardAction>
        ) : null}
      </CardHeader>
      {facts.length || profile?.description ? (
        <CardContent className="grid gap-3 text-sm">
          {profile?.description ? <p className="text-muted-foreground first-letter:uppercase">{profile.description}</p> : null}
          {facts.length ? (
            <dl className="grid grid-cols-2 gap-2 @lg:grid-cols-3">
              {facts.map((fact, index) => {
                const known = fact.label in FACTS ? FACTS[fact.label as keyof typeof FACTS] : null
                const Icon = known?.[1] ?? BuildingIcon
                return (
                  <motion.div
                    key={fact.label}
                    initial={reduce ? false : { opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.25, delay: index * 0.04, ease: [0.23, 1, 0.32, 1] }}
                    className="min-w-0 rounded-lg border bg-muted/30 px-2.5 py-2 transition-colors hover:bg-muted/60"
                  >
                    <dt className="flex items-center gap-1 text-[11px] text-muted-foreground">
                      <Icon className="size-3 shrink-0" /> {known ? t(`labels.${known[0]}`) : fact.label}
                    </dt>
                    <dd className="truncate font-medium tabular-nums" title={fact.value}>{fact.value}</dd>
                  </motion.div>
                )
              })}
            </dl>
          ) : null}
          <div className="flex flex-wrap items-center gap-1.5">
            {profile?.match === "name" ? <Badge variant="outline" className="font-normal text-muted-foreground">{t("byName")}</Badge> : null}
            {[...(profile?.links ?? []), ...(profile?.sources ?? []).map((source) => ({ label: source.name, url: source.url }))].map((link) => (
              <a key={link.url} href={link.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
                {link.label} <ExternalLinkIcon className="size-3" />
              </a>
            ))}
          </div>
        </CardContent>
      ) : null}
    </Card>
  )
}
