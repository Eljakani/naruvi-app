"use client"

import { motion, useReducedMotion } from "motion/react"
import { useRouter } from "next/navigation"
import { BuildingIcon, CalendarIcon, ExternalLinkIcon, FactoryIcon, HashIcon, MapPinIcon, NetworkIcon, RefreshCwIcon, TrendingUpIcon, UsersIcon } from "lucide-react"
import { toast } from "sonner"
import { refreshCompanyProfileAction } from "@/app/(app)/companies/actions"
import ParticleButton from "@/components/kokonutui/particle-button"
import { Badge } from "@/components/ui/badge"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import type { CompanyProfile } from "@/server/companies/profile"

const ICONS: Record<string, React.ElementType> = {
  Employees: UsersIcon, "Staff (France)": UsersIcon, Size: BuildingIcon, Founded: CalendarIcon, Registered: CalendarIcon,
  Headquarters: MapPinIcon, "Head office": MapPinIcon, Industry: FactoryIcon, Parent: NetworkIcon, Ticker: TrendingUpIcon, SIREN: HashIcon,
}

/** Public facts about the company as small tiles, with where they came from. */
export function CompanyFacts({ companyId, name, profile, enabled }: { companyId: string; name: string; profile: CompanyProfile | null; enabled: boolean }) {
  const router = useRouter()
  const reduce = useReducedMotion()
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
    <Card className="h-fit">
      <CardHeader>
        <CardTitle className="text-sm">Company facts</CardTitle>
        <CardDescription className="text-xs">
          {profile?.sources.length
            ? `From ${profile.sources.map((source) => source.name).join(" and ")}, ${new Date(profile.fetchedAt).toLocaleDateString(undefined, { day: "numeric", month: "short" })}`
            : enabled
              ? `No public record matched ${name} yet. Adding the company’s website helps.`
              : "Turned off in Integrations."}
        </CardDescription>
        {enabled ? (
          <CardAction>
            <ParticleButton variant="ghost" size="sm" onClick={refresh} pendingLabel="Looking up" successLabel="Updated" errorLabel="Retry" aria-label="Look up company facts again">
              <RefreshCwIcon />
            </ParticleButton>
          </CardAction>
        ) : null}
      </CardHeader>
      {facts.length || profile?.description ? (
        <CardContent className="grid gap-3 text-sm">
          {profile?.description ? <p className="text-muted-foreground first-letter:uppercase">{profile.description}</p> : null}
          {facts.length ? (
            <dl className="grid grid-cols-2 gap-2">
              {facts.map((fact, index) => {
                const Icon = ICONS[fact.label] ?? BuildingIcon
                return (
                  <motion.div
                    key={fact.label}
                    initial={reduce ? false : { opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.25, delay: index * 0.04, ease: [0.23, 1, 0.32, 1] }}
                    className="min-w-0 rounded-lg border bg-muted/30 px-2.5 py-2 transition-colors hover:bg-muted/60"
                  >
                    <dt className="flex items-center gap-1 text-[11px] text-muted-foreground">
                      <Icon className="size-3 shrink-0" /> {fact.label}
                    </dt>
                    <dd className="truncate font-medium tabular-nums" title={fact.value}>{fact.value}</dd>
                  </motion.div>
                )
              })}
            </dl>
          ) : null}
          <div className="flex flex-wrap items-center gap-1.5">
            {profile?.match === "name" ? <Badge variant="outline" className="font-normal text-muted-foreground">Matched by name only</Badge> : null}
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
