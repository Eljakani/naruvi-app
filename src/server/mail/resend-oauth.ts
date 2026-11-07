import "server-only"
import { createHash, randomBytes } from "node:crypto"
import { z } from "zod"
import { env } from "@/lib/env"
import { decryptSecret, encryptSecret, encryptionReady } from "@/server/settings/encryption"

const api = "https://api.resend.com"
export const resendOAuthPath = "/api/oauth/resend"
export const resendOAuthCookie = "naruvi-oauth-resend"
const scope = "full_access"
const clientSchema = z.object({ client_id: z.string().min(1), client_secret: z.string().min(1).optional() })
const tokenSchema = z.object({ access_token: z.string().min(1), refresh_token: z.string().min(1), expires_in: z.number().positive() })
const credentialSchema = clientSchema.extend({
  access_token: z.string().min(1),
  refresh_token: z.string().min(1),
  expiresAt: z.number(),
})
export type ResendCredential = z.infer<typeof credentialSchema>

export const resendAddresses = z.object({
  email: z.string().trim().email("Enter the verified sender address.").max(254),
  inboundEmail: z.string().trim().email("Enter your Resend receiving address.").max(254),
  displayName: z.string().trim().max(120).regex(/^[^\r\n<>]*$/, "Use a plain sender name."),
})
const flowSchema = z.object({
  client: clientSchema,
  redirectUri: z.string().url(),
  state: z.string(),
  verifier: z.string(),
  expiresAt: z.number(),
  addresses: resendAddresses,
})

async function oauthPost(path: string, body: object | URLSearchParams) {
  const form = body instanceof URLSearchParams
  const response = await fetch(`${api}/oauth/${path}`, {
    method: "POST",
    headers: { "Content-Type": form ? "application/x-www-form-urlencoded" : "application/json" },
    body: form ? body : JSON.stringify(body),
    redirect: "error",
    signal: AbortSignal.timeout(15_000),
  })
  if (!response.ok) throw new Error(`Resend sign-in failed (${response.status}). Try connecting again.`)
  return response.json().catch(() => null) as Promise<unknown>
}

export async function startResendOAuth(origin: string, raw: z.input<typeof resendAddresses>) {
  const addresses = resendAddresses.parse(raw)
  if (!encryptionReady(env.SETTINGS_ENCRYPTION_KEY)) throw new Error("Set up secure storage before connecting Resend.")
  const base = new URL(origin)
  const secure = base.protocol === "https:"
  if (!secure && (base.protocol !== "http:" || !["localhost", "127.0.0.1", "[::1]"].includes(base.hostname))) {
    throw new Error("Open Naruvi on localhost or use HTTPS to connect Resend.")
  }
  const redirectUri = new URL(`${resendOAuthPath}/callback`, base).href
  const client = clientSchema.parse(await oauthPost("register", {
    client_name: "Naruvi",
    redirect_uris: [redirectUri],
    grant_types: ["authorization_code", "refresh_token"],
    response_types: ["code"],
    token_endpoint_auth_method: secure ? "client_secret_post" : "none",
    scope,
  }))
  if (secure && !client.client_secret) throw new Error("Resend did not register the secure sign-in client.")
  const state = randomBytes(24).toString("base64url")
  const verifier = randomBytes(48).toString("base64url")
  const challenge = createHash("sha256").update(verifier).digest("base64url")
  const url = new URL(`${api}/oauth/authorize`)
  url.search = new URLSearchParams({
    client_id: client.client_id, redirect_uri: redirectUri, response_type: "code", scope,
    state, code_challenge: challenge, code_challenge_method: "S256",
  }).toString()
  const cookie = encryptSecret(JSON.stringify({
    client, redirectUri, state, verifier, addresses, expiresAt: Date.now() + 600_000,
  }), env.SETTINGS_ENCRYPTION_KEY, resendOAuthCookie)
  return { url: url.href, cookie, secure }
}

export function readResendOAuthFlow(cookie: string) {
  return flowSchema.parse(JSON.parse(decryptSecret(cookie, env.SETTINGS_ENCRYPTION_KEY, resendOAuthCookie)))
}

async function exchange(client: z.infer<typeof clientSchema>, fields: Record<string, string>): Promise<ResendCredential> {
  const params = new URLSearchParams({ ...fields, client_id: client.client_id })
  if (client.client_secret) params.set("client_secret", client.client_secret)
  const tokens = tokenSchema.parse(await oauthPost("token", params))
  return { ...client, ...tokens, expiresAt: Date.now() + tokens.expires_in * 1000 }
}

export function finishResendOAuth(flow: ReturnType<typeof readResendOAuthFlow>, code: string) {
  return exchange(flow.client, { grant_type: "authorization_code", code, redirect_uri: flow.redirectUri, code_verifier: flow.verifier })
}

export async function refreshResendOAuth(secret: string) {
  const credential = credentialSchema.parse(JSON.parse(secret))
  if (credential.expiresAt > Date.now() + 60_000) return { credential, rotated: false }
  return {
    credential: await exchange(credential, { grant_type: "refresh_token", refresh_token: credential.refresh_token }),
    rotated: true,
  }
}

export async function revokeResendOAuth(secret: string) {
  const credential = credentialSchema.parse(JSON.parse(secret))
  const params = new URLSearchParams({
    client_id: credential.client_id, token: credential.refresh_token, token_type_hint: "refresh_token",
  })
  if (credential.client_secret) params.set("client_secret", credential.client_secret)
  await oauthPost("revoke", params)
}
