"use client"

import { useEffect, useState, useTransition } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { ExternalLinkIcon, Loader2Icon, LogInIcon, SettingsIcon } from "lucide-react"
import { toast } from "sonner"
import { saveOAuthClientAction } from "@/app/(app)/integrations/actions"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { OAUTH_PROVIDERS, type OAuthProviderId } from "@/lib/oauth"

type Clients = Record<OAuthProviderId, { configured: boolean; clientId: string; tenant: string }>

/** "Sign in with Google / Microsoft": uses your own registered app, set up once. */
export function OAuthSignIn({ clients, origin }: { clients: Clients; origin: string }) {
  const [setup, setSetup] = useState<OAuthProviderId | null>(null)
  return (
    <div className="grid gap-2">
      <p className="text-sm font-medium">Sign in instead of using an app password</p>
      <div className="flex flex-wrap gap-2">
        {(["google", "microsoft"] as const).map((provider) =>
          clients[provider].configured ? (
            <div key={provider} className="flex">
              <Button variant="outline" className="rounded-r-none" nativeButton={false} render={<a href={`/api/oauth/${provider}/start`} />}>
                <LogInIcon /> Sign in with {OAUTH_PROVIDERS[provider].name}
              </Button>
              <Button variant="outline" size="icon" className="-ml-px rounded-l-none" aria-label={`${OAUTH_PROVIDERS[provider].name} app settings`} onClick={() => setSetup(provider)}>
                <SettingsIcon />
              </Button>
            </div>
          ) : (
            <Button key={provider} variant="outline" onClick={() => setSetup(provider)}>
              <SettingsIcon /> Set up {OAUTH_PROVIDERS[provider].name} sign-in
            </Button>
          ),
        )}
      </div>
      <p className="text-xs text-muted-foreground">Naruvi runs on your computer, so it signs in through an app you register once with Google or Microsoft (about 10 minutes). Your mail never passes through anyone else’s server.</p>
      {setup ? <SetupDialog provider={setup} current={clients[setup]} origin={origin} onClose={() => setSetup(null)} /> : null}
    </div>
  )
}

function SetupDialog({ provider, current, origin, onClose }: { provider: OAuthProviderId; current: Clients[OAuthProviderId]; origin: string; onClose: () => void }) {
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
          <DialogTitle>{info.name} sign-in</DialogTitle>
          <DialogDescription>Register Naruvi as your own app, then paste its details here. The secret is stored encrypted.</DialogDescription>
        </DialogHeader>
        <ol className="grid list-decimal gap-1.5 pl-5 text-sm text-muted-foreground">
          {info.steps.map((step) => <li key={step}>{step}</li>)}
        </ol>
        <a href={info.consoleUrl} target="_blank" rel="noreferrer" className="inline-flex w-fit items-center gap-1 text-sm underline underline-offset-2">
          Open the {info.name} console <ExternalLinkIcon className="size-3" />
        </a>
        <FieldGroup className="gap-3">
          <Field>
            <FieldLabel htmlFor="oauth-redirect">Redirect URI</FieldLabel>
            <Input id="oauth-redirect" readOnly value={redirect} className="font-mono text-xs" onFocus={(event) => event.currentTarget.select()} />
          </Field>
          <Field>
            <FieldLabel htmlFor="oauth-id">Client ID</FieldLabel>
            <Input id="oauth-id" autoComplete="off" data-1p-ignore data-lpignore="true" data-bwignore data-form-type="other" value={clientId} onChange={(event) => setClientId(event.target.value)} />
          </Field>
          <Field>
            <FieldLabel htmlFor="oauth-secret">Client secret</FieldLabel>
            <Input id="oauth-secret" autoComplete="new-password" data-1p-ignore data-lpignore="true" data-bwignore data-form-type="other" type="password" value={clientSecret} onChange={(event) => setClientSecret(event.target.value)} placeholder={current.configured ? "Leave empty to keep the saved secret" : ""} />
          </Field>
          {provider === "microsoft" ? (
            <Field>
              <FieldLabel htmlFor="oauth-tenant">Tenant</FieldLabel>
              <Input id="oauth-tenant" autoComplete="off" data-1p-ignore data-lpignore="true" data-bwignore data-form-type="other" value={tenant} onChange={(event) => setTenant(event.target.value)} />
              <FieldDescription>common for most people; consumers for personal accounts only, or your organization’s tenant ID.</FieldDescription>
            </Field>
          ) : null}
        </FieldGroup>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button
            disabled={pending || !clientId}
            onClick={() =>
              startTransition(async () => {
                const result = await saveOAuthClientAction(provider, { clientId, clientSecret, tenant })
                if (!result.ok) return void toast.error(result.message)
                toast.success(`${info.name} sign-in is ready`, { description: `Click “Sign in with ${info.name}”.` })
                onClose()
              })
            }
          >
            {pending ? <Loader2Icon className="animate-spin" /> : null} Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** Shows how the sign-in went after the provider sends you back (?oauth=…), then cleans the URL. */
export function OAuthResult() {
  const params = useSearchParams()
  const router = useRouter()
  const message = params.get("oauth")
  useEffect(() => {
    if (!message) return
    if (message.startsWith("connected:")) toast.success(`Connected ${message.slice(10)}`, { description: "Naruvi checks it every 5 minutes." })
    else toast.error("Sign-in didn’t work", { description: message })
    router.replace("/integrations", { scroll: false })
  }, [message, router])
  return null
}
