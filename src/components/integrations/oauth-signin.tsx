"use client"

import { useEffect, useState, useTransition } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { ExternalLinkIcon, Loader2Icon, SettingsIcon } from "lucide-react"
import { GoogleLogo, MicrosoftLogo } from "@/components/brand-logos"
import { Badge } from "@/components/ui/badge"
import { ButtonGroup } from "@/components/ui/button-group"
import { toast } from "sonner"
import { saveOAuthClientAction } from "@/app/[locale]/(app)/integrations/actions"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { OAUTH_PROVIDERS, type OAuthProviderId } from "@/lib/oauth"
import { useTranslations } from "next-intl"

type Clients = Record<OAuthProviderId, { configured: boolean; clientId: string; tenant: string }>

/** "Sign in with Google / Microsoft": uses your own registered app, set up once. */
export function OAuthSignIn({ clients, origin }: { clients: Clients; origin: string }) {
  const t = useTranslations("integrations.oauth")
  const [setup, setSetup] = useState<OAuthProviderId | null>(null)
  return (
    <div className="grid gap-3">
      <div className="grid gap-2 sm:grid-cols-2">
        {(["google", "microsoft"] as const).map((provider) => {
          const name = OAUTH_PROVIDERS[provider].name
          const Logo = provider === "google" ? GoogleLogo : MicrosoftLogo
          return clients[provider].configured ? (
            <ButtonGroup key={provider} className="w-full">
              <Button variant="outline" size="lg" className="flex-1" nativeButton={false} render={<a href={`/api/oauth/${provider}/start`} />}>
                <Logo className="size-4" /> {t("continue", { name })}
              </Button>
              <Button variant="outline" size="icon-lg" aria-label={t("appSettings", { name })} onClick={() => setSetup(provider)}>
                <SettingsIcon />
              </Button>
            </ButtonGroup>
          ) : (
            <Button key={provider} variant="outline" size="lg" className="w-full" onClick={() => setSetup(provider)}>
              <Logo className="size-4" /> {t("continue", { name })}
              <Badge variant="secondary" className="ms-auto font-normal">{t("setupOnce")}</Badge>
            </Button>
          )
        })}
      </div>
      <p className="text-xs text-muted-foreground">{t("explain")}</p>
      {setup ? <SetupDialog provider={setup} current={clients[setup]} origin={origin} onClose={() => setSetup(null)} /> : null}
    </div>
  )
}

function SetupDialog({ provider, current, origin, onClose }: { provider: OAuthProviderId; current: Clients[OAuthProviderId]; origin: string; onClose: () => void }) {
  const t = useTranslations("integrations.oauth")
  const info = OAUTH_PROVIDERS[provider]
  const [clientId, setClientId] = useState(current.clientId)
  const [clientSecret, setClientSecret] = useState("")
  const [tenant, setTenant] = useState(current.tenant || "common")
  const [pending, startTransition] = useTransition()
  const redirect = `${origin}/api/oauth/${provider}/callback`
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">{provider === "google" ? <GoogleLogo className="size-5" /> : <MicrosoftLogo className="size-5" />} {t("setupTitle", { name: info.name })}</DialogTitle>
          <DialogDescription>{t("setupBody")}</DialogDescription>
        </DialogHeader>
        <ol className="grid list-decimal gap-1.5 ps-5 text-sm text-muted-foreground">
          {info.steps.map((step, index) => <li key={step}>{t(`steps.${provider}.${index}` as never)}</li>)}
        </ol>
        <a href={info.consoleUrl} target="_blank" rel="noreferrer" className="inline-flex w-fit items-center gap-1 text-sm underline underline-offset-2">
          {t("console", { name: info.name })} <ExternalLinkIcon className="size-3" />
        </a>
        <FieldGroup className="gap-3">
          <Field>
            <FieldLabel htmlFor="oauth-redirect">{t("redirect")}</FieldLabel>
            <Input id="oauth-redirect" readOnly value={redirect} className="font-mono text-xs" onFocus={(event) => event.currentTarget.select()} />
          </Field>
          <Field>
            <FieldLabel htmlFor="oauth-id">{t("clientId")}</FieldLabel>
            <Input id="oauth-id" autoComplete="off" data-1p-ignore data-lpignore="true" data-bwignore data-form-type="other" value={clientId} onChange={(event) => setClientId(event.target.value)} />
          </Field>
          <Field>
            <FieldLabel htmlFor="oauth-secret">{t("clientSecret")}</FieldLabel>
            <Input id="oauth-secret" autoComplete="new-password" data-1p-ignore data-lpignore="true" data-bwignore data-form-type="other" type="password" value={clientSecret} onChange={(event) => setClientSecret(event.target.value)} placeholder={current.configured ? t("keepSecret") : ""} />
          </Field>
          {provider === "microsoft" ? (
            <Field>
              <FieldLabel htmlFor="oauth-tenant">{t("tenant")}</FieldLabel>
              <Input id="oauth-tenant" autoComplete="off" data-1p-ignore data-lpignore="true" data-bwignore data-form-type="other" value={tenant} onChange={(event) => setTenant(event.target.value)} />
              <FieldDescription>{t("tenantHint")}</FieldDescription>
            </Field>
          ) : null}
        </FieldGroup>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>{t("cancel")}</Button>
          <Button
            disabled={pending || !clientId}
            onClick={() =>
              startTransition(async () => {
                const result = await saveOAuthClientAction(provider, { clientId, clientSecret, tenant })
                if (!result.ok) return void toast.error(result.message)
                toast.success(t("ready", { name: info.name }), { description: t("readyBody", { name: info.name }) })
                onClose()
              })
            }
          >
            {pending ? <Loader2Icon className="animate-spin" /> : null} {t("save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** Shows how the sign-in went after the provider sends you back (?oauth=…), then cleans the URL. */
export function OAuthResult() {
  const t = useTranslations("integrations.oauth")
  const params = useSearchParams()
  const router = useRouter()
  const message = params.get("oauth")
  useEffect(() => {
    if (!message) return
    if (message.startsWith("connected:")) toast.success(t("connected", { account: message.slice(10) }), { description: t("connectedBody") })
    else toast.error(t("failed"), { description: message })
    router.replace("/integrations", { scroll: false })
  }, [message, router, t])
  return null
}
