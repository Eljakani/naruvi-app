"use client"

import { useState, type FormEvent } from "react"
import { CheckIcon, EyeIcon, EyeOffIcon, ArrowRightIcon, UserRoundIcon, LockKeyholeIcon, ShieldCheckIcon, CircleAlertIcon } from "lucide-react"
import ParticleButton from "@/components/kokonutui/particle-button"
import { authDestination } from "@/lib/auth-navigation"
import { AuthFeedback } from "@/components/auth/auth-feedback"
import { Input } from "@/components/ui/input"
import { useTranslations } from "next-intl"

type Field = "username" | "password" | "confirm"
export function OwnerForm({ setup, returnTo = "/", initialError = "" }: { setup: boolean; returnTo?: string; initialError?: string }) {
  const [values, setValues] = useState({ username: "", password: "", confirm: "" })
  const [touched, setTouched] = useState<Partial<Record<Field, boolean>>>({})
  const [visible, setVisible] = useState({ password: false, confirm: false })
  const [pending, setPending] = useState(false)
  const [complete, setComplete] = useState(false)
  const [error, setError] = useState(initialError)
  const [caps, setCaps] = useState(false)
  const t = useTranslations("auth")
  const errors: Record<Field, string> = {
    username: /^[a-zA-Z0-9_-]{3,64}$/.test(values.username.trim()) ? "" : t("usernameRule"),
    password: values.password.length >= 16 && values.password.length <= 128 ? "" : t("passwordRule"),
    confirm: values.confirm === values.password && values.confirm ? "" : values.confirm ? t("mismatch") : t("confirmRequired"),
  }
  const fields: Field[] = setup ? ["username", "password", "confirm"] : ["username", "password"]
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending) return
    setTouched({ username: true, password: true, confirm: true })
    const invalid = fields.find(field => errors[field])
    if (invalid) { document.getElementById(`owner-${invalid}`)?.focus(); return }
    setPending(true)
    setError("")
    let navigating = false
    try {
      const response = await fetch(setup ? "/auth/register" : "/auth/login", {
        method: "POST", headers: { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ ...values, next: authDestination(returnTo) }),
      })
      const body = await response.json().catch(() => null)
      if (!response.ok) {
        if (setup && response.status === 409) {
          navigating = true
          window.location.replace("/login?notice=already-configured")
          return
        }
        if (setup && response.status === 403 && body?.error) {
          navigating = true
          window.location.replace("/login?notice=setup-expired")
          return
        }
        setError((response.status === 429 && response.headers.get("retry-after") ? t("tooMany", { seconds: Number(response.headers.get("retry-after")) }) : body?.error) || (response.status === 403 ? t("needsRefresh") : t("cantConnect")))
        return
      }
      setComplete(true)
      navigating = true
      window.location.replace(authDestination(body?.redirect, setup ? "/setup" : authDestination(returnTo)))
    } catch { setError(t("cantReach")) }
    finally { if (!navigating) setPending(false) }
  }
  return (
    <form onSubmit={submit} method="post" action={setup ? "/auth/register" : "/auth/login"} noValidate className="space-y-3" aria-busy={pending}>
      <input type="hidden" name="next" value={authDestination(returnTo)} />
      {error ? <div role="alert" className="cb-enter flex items-start gap-2 rounded-lg border border-destructive/25 bg-destructive/5 px-3 py-2.5 text-sm leading-relaxed text-destructive"><CircleAlertIcon aria-hidden="true" className="mt-0.5 size-4 shrink-0" /><span>{error}</span></div> : null}
      {fields.map(field => {
        const password = field !== "username"
        const passwordField = field === "confirm" ? "confirm" : "password"
        const revealed = password && visible[passwordField]
        const Icon = field === "username" ? UserRoundIcon : field === "password" ? LockKeyholeIcon : ShieldCheckIcon
        const invalid = touched[field] && !!errors[field]
        const showHint = invalid || (setup && (field !== "confirm" || !!values.confirm))
        return <div key={field} className="space-y-1.5">
          <label htmlFor={`owner-${field}`} className="sr-only">{t(field)}</label>
          <div className="group/auth-field relative">
            <Icon aria-hidden="true" className="pointer-events-none absolute start-3 top-1/2 z-10 size-4 -translate-y-1/2 text-muted-foreground transition-colors duration-150 group-focus-within/auth-field:text-brand" />
            <Input id={`owner-${field}`} name={field} value={values[field]} type={password && !revealed ? "password" : "text"}
              placeholder={t(field)}
              autoComplete={password ? setup ? "new-password" : "current-password" : "username"}
              autoCapitalize="none" spellCheck={false} required disabled={pending}
              maxLength={password ? 128 : 64} aria-invalid={invalid || undefined} aria-describedby={showHint ? `owner-${field}-hint` : undefined}
              className={`naruvi-auth-input h-12 bg-background ps-10 ${password ? "pe-12" : ""}`}
              onChange={event => { setValues(previous => ({ ...previous, [field]: event.target.value })); setError("") }}
              onBlur={() => { setTouched(previous => ({ ...previous, [field]: true })); setCaps(false) }}
              onKeyUp={event => password && setCaps(event.getModifierState("CapsLock"))} />
            {password ? <button type="button" disabled={pending} onClick={() => setVisible(previous => ({ ...previous, [passwordField]: !previous[passwordField] }))} aria-label={revealed ? t("hidePasswords") : t("showPasswords")} aria-pressed={revealed} aria-controls={`owner-${field}`} className="absolute inset-y-0 end-0 grid w-11 place-items-center rounded-e-lg text-muted-foreground transition-colors duration-150 hover:bg-muted/50 hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"><AuthFeedback state={revealed ? "visible" : "hidden"}>{revealed ? <EyeOffIcon className="size-4" /> : <EyeIcon className="size-4" />}</AuthFeedback></button> : null}
          </div>
          {showHint ? <div id={`owner-${field}-hint`} className={`min-h-4 text-xs ${invalid ? "text-destructive" : "text-muted-foreground"}`} aria-live="polite">
            <AuthFeedback state={invalid ? `error-${field}` : !errors[field] && values[field] ? `valid-${field}` : `hint-${field}`}>
            {invalid ? errors[field] : field === "username" ? setup ? t("usernameHint") : "" : field === "password" ? setup ? <span className="flex items-center gap-1.5">{!errors.password ? <CheckIcon className="size-3 text-brand" /> : null}{!errors.password ? t("lengthMet") : t("passwordHint")}</span> : "" : values.confirm && !errors.confirm ? <span className="flex items-center gap-1.5 text-brand"><CheckIcon className="size-3" />{t("match")}</span> : t("enterAgain")}
            </AuthFeedback>
          </div> : null}
        </div>
      })}
      {caps ? <p role="status" className="text-xs text-muted-foreground">{t("capsLock")}</p> : null}
      <div className="pt-2">
        <ParticleButton type="submit" status={complete ? "success" : pending ? "pending" : "idle"} disabled={pending} particles={false}
          successLabel={setup ? t("ready") : t("signedIn")}
          pendingLabel={setup ? t("creating") : t("signingIn")}
          icon={<ArrowRightIcon aria-hidden="true" className="size-4" />}
          className="h-12 w-full! rounded-lg bg-brand text-brand-foreground hover:bg-brand/90 motion-reduce:[&_svg]:animate-none">
          {setup ? t("create") : t("signIn")}
        </ParticleButton>
      </div>
      {setup ? <p className="flex items-center justify-center gap-1.5 text-center text-xs leading-relaxed text-muted-foreground"><ShieldCheckIcon aria-hidden="true" className="size-3.5 shrink-0" />{t("oneOwner")}</p> : null}
    </form>
  )
}
