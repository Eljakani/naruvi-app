import "server-only"
import { createHash, randomBytes } from "node:crypto"
import { eq } from "drizzle-orm"
import { z } from "zod"
import { env } from "@/lib/env"
import { authorizeUrl, idTokenEmail, OAUTH_PROVIDERS, type OAuthProviderId } from "@/lib/oauth"
import { db } from "@/server/db/client"
import { mailAccounts, settings } from "@/server/db/schema"
import { decryptSecret, encryptSecret, encryptionReady } from "@/server/settings/encryption"
import { SettingsError } from "@/server/settings/errors"

const key = (provider: OAuthProviderId) => `integration.oauth.${provider}`
const stored = z.object({ clientId: z.string().min(1), encryptedSecret: z.string(), tenant: z.string().default("common") })

export const oauthClientInput = z.object({
  clientId: z.string().trim().min(10, "Paste the client ID").max(300),
  /** Empty keeps the saved secret. */
  clientSecret: z.string().trim().max(500).default(""),
  tenant: z.string().trim().regex(/^[\w.-]{1,100}$/, "Use common, consumers, organizations or your tenant ID").default("common"),
})

async function readClient(provider: OAuthProviderId) {
  const row = await db.query.settings.findFirst({ where: eq(settings.key, key(provider)) })
  const parsed = stored.safeParse(row?.value)
  if (!parsed.success) return null
  return { ...parsed.data, clientSecret: decryptSecret(parsed.data.encryptedSecret, env.SETTINGS_ENCRYPTION_KEY, `oauth:${provider}:${parsed.data.clientId}`) }
}

/** Which providers have an app configured (never the secret). */
export async function oauthClients() {
  const out: Record<OAuthProviderId, { configured: boolean; clientId: string; tenant: string }> = { google: { configured: false, clientId: "", tenant: "common" }, microsoft: { configured: false, clientId: "", tenant: "common" } }
  for (const provider of ["google", "microsoft"] as const) {
    const row = await db.query.settings.findFirst({ where: eq(settings.key, key(provider)) })
    const parsed = stored.safeParse(row?.value)
    if (parsed.success) out[provider] = { configured: true, clientId: parsed.data.clientId, tenant: parsed.data.tenant }
  }
  return out
}

export async function saveOAuthClient(provider: OAuthProviderId, raw: z.input<typeof oauthClientInput>) {
  const input = oauthClientInput.parse(raw)
  if (!encryptionReady(env.SETTINGS_ENCRYPTION_KEY)) throw new SettingsError("Set SETTINGS_ENCRYPTION_KEY first (npm run settings:key), then restart Naruvi.")
  const previous = await readClient(provider).catch(() => null)
  const secret = input.clientSecret || (previous?.clientId === input.clientId ? previous.clientSecret : "")
  if (!secret) throw new SettingsError("Paste the client secret.")
  const value = { clientId: input.clientId, tenant: input.tenant, encryptedSecret: encryptSecret(secret, env.SETTINGS_ENCRYPTION_KEY, `oauth:${provider}:${input.clientId}`) }
  await db.insert(settings).values({ key: key(provider), value }).onConflictDoUpdate({ target: settings.key, set: { value } })
}

export const redirectUri = (origin: string, provider: OAuthProviderId) => `${origin}/api/oauth/${provider}/callback`

/** Start sign-in: a random state and PKCE verifier, kept by the caller in a short-lived cookie. */
export async function startOAuth(provider: OAuthProviderId, origin: string, loginHint?: string) {
  const client = await readClient(provider)
  if (!client) throw new SettingsError(`Set up the ${OAUTH_PROVIDERS[provider].name} app first.`)
  const state = randomBytes(24).toString("base64url")
  const verifier = randomBytes(48).toString("base64url")
  const challenge = createHash("sha256").update(verifier).digest("base64url")
  return { url: authorizeUrl(OAUTH_PROVIDERS[provider], { clientId: client.clientId, redirectUri: redirectUri(origin, provider), state, challenge, tenant: client.tenant, loginHint }), state, verifier }
}

const tokenReply = z.object({ access_token: z.string(), refresh_token: z.string().optional(), expires_in: z.coerce.number().default(3600), id_token: z.string().optional() })

async function tokenRequest(provider: OAuthProviderId, body: Record<string, string>, fetcher: typeof fetch) {
  const client = await readClient(provider)
  if (!client) throw new SettingsError(`Set up the ${OAUTH_PROVIDERS[provider].name} app first.`)
  const res = await fetcher(OAUTH_PROVIDERS[provider].token(client.tenant), {
    method: "POST",
    redirect: "error",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: client.clientId, client_secret: client.clientSecret, ...body }),
    signal: AbortSignal.timeout(15_000),
  })
  const json = (await res.json().catch(() => ({}))) as { error?: string; error_description?: string }
  if (!res.ok) throw new SettingsError(`${OAUTH_PROVIDERS[provider].name} refused the sign-in: ${json.error_description?.split("\n")[0] ?? json.error ?? res.status}`)
  return tokenReply.parse(json)
}

/** Finish sign-in: exchange the code, then connect (or reconnect) the mailbox. */
export async function finishOAuth(provider: OAuthProviderId, input: { code: string; verifier: string; origin: string }, fetcher: typeof fetch = fetch) {
  const tokens = await tokenRequest(provider, { grant_type: "authorization_code", code: input.code, code_verifier: input.verifier, redirect_uri: redirectUri(input.origin, provider) }, fetcher)
  if (!tokens.refresh_token) throw new SettingsError("No refresh token came back. Remove Naruvi’s access in your account settings and sign in again.")
  const email = tokens.id_token ? idTokenEmail(tokens.id_token) : null
  if (!email) throw new SettingsError("The sign-in didn’t include your email address. Check that the email scope is allowed.")
  const values = {
    email,
    provider: provider === "google" ? "gmail" : "outlook",
    username: email,
    authType: "oauth",
    encryptedPassword: encryptSecret(tokens.refresh_token, env.SETTINGS_ENCRYPTION_KEY, `mail:${email.toLowerCase()}`),
    ...OAUTH_PROVIDERS[provider].server,
    status: "ok",
    lastError: null,
  }
  cache.set(email.toLowerCase(), { token: tokens.access_token, expires: Date.now() + (tokens.expires_in - 120) * 1000 })
  const [existing] = await db.select({ id: mailAccounts.id, email: mailAccounts.email }).from(mailAccounts).limit(1)
  if (existing) await db.update(mailAccounts).set({ ...values, ...(existing.email.toLowerCase() !== email.toLowerCase() ? { cursor: {} } : {}) }).where(eq(mailAccounts.id, existing.id))
  else await db.insert(mailAccounts).values({ ...values, displayName: "", syncFrom: new Date(Date.now() - 30 * 86_400_000) })
  return email
}

const cache = new Map<string, { token: string; expires: number }>()

/** A fresh access token for an OAuth mailbox; refreshes (and stores a rotated refresh token) when needed. */
export async function accessToken(account: { id: string; email: string; provider: string; refreshToken: string }, fetcher: typeof fetch = fetch) {
  const cached = cache.get(account.email.toLowerCase())
  if (cached && cached.expires > Date.now()) return cached.token
  const provider: OAuthProviderId = account.provider === "gmail" ? "google" : "microsoft"
  const tokens = await tokenRequest(provider, { grant_type: "refresh_token", refresh_token: account.refreshToken }, fetcher)
  cache.set(account.email.toLowerCase(), { token: tokens.access_token, expires: Date.now() + (tokens.expires_in - 120) * 1000 })
  if (tokens.refresh_token && tokens.refresh_token !== account.refreshToken) {
    await db.update(mailAccounts).set({ encryptedPassword: encryptSecret(tokens.refresh_token, env.SETTINGS_ENCRYPTION_KEY, `mail:${account.email.toLowerCase()}`) }).where(eq(mailAccounts.id, account.id))
  }
  return tokens.access_token
}
