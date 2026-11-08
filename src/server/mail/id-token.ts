import { createHash } from "node:crypto"
import { createRemoteJWKSet, decodeJwt, jwtVerify, type JWTVerifyGetKey } from "jose"
import type { OAuthProviderId } from "@/lib/oauth"

export const oauthNonce = (verifier: string) => createHash("sha256").update(`naruvi-oidc:${verifier}`).digest("base64url")
const microsoftPersonalTenant = "9188040d-6c67-4c5b-b112-36a304b66dad"
const guid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i
const googleKeys = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"), { timeoutDuration: 5000 })
const microsoftKeys = createRemoteJWKSet(new URL("https://login.microsoftonline.com/common/discovery/v2.0/keys"), { timeoutDuration: 5000 })
const discovered = new Map<string, { issuer: string; expires: number }>()
async function domainIssuer(tenant: string) {
  const cached = discovered.get(tenant)
  if (cached && cached.expires > Date.now()) return cached.issuer
  const response = await fetch(`https://login.microsoftonline.com/${encodeURIComponent(tenant)}/v2.0/.well-known/openid-configuration`, { redirect: "error", signal: AbortSignal.timeout(5000) })
  if (!response.ok) throw new Error("Could not verify the Microsoft tenant.")
  const data = await response.json() as { issuer?: string }
  if (!data.issuer || !/^https:\/\/login\.microsoftonline\.com\/[a-f0-9-]{36}\/v2\.0$/.test(data.issuer)) throw new Error("Unexpected Microsoft issuer.")
  discovered.clear()
  discovered.set(tenant, { issuer: data.issuer, expires: Date.now() + 3600_000 })
  return data.issuer
}
/** The optional key resolver is only for local signed-token regression fixtures. */
export async function verifyMailboxIdToken(token: string, input: { provider: OAuthProviderId; clientId: string; tenant: string; nonce: string }, keys?: JWTVerifyGetKey) {
  let issuer: string | string[] = ["https://accounts.google.com", "accounts.google.com"]
  if (input.provider === "microsoft") {
    // Unverified tid only selects an expected issuer; signature + issuer are verified below.
    const tid = decodeJwt(token).tid
    if (typeof tid !== "string" || !guid.test(tid)) throw new Error("Invalid Microsoft tenant.")
    const tenant = input.tenant.toLowerCase()
    if (tenant === "consumers" && tid !== microsoftPersonalTenant || tenant === "organizations" && tid === microsoftPersonalTenant || guid.test(tenant) && tid !== tenant) throw new Error("Microsoft tenant does not match.")
    issuer = `https://login.microsoftonline.com/${tid}/v2.0`
    if (!["common", "consumers", "organizations"].includes(tenant) && !guid.test(tenant) && issuer !== await domainIssuer(tenant)) throw new Error("Microsoft tenant does not match.")
  }
  const { payload } = await jwtVerify(token, keys || (input.provider === "google" ? googleKeys : microsoftKeys), { algorithms: ["RS256"], issuer, audience: input.clientId, requiredClaims: ["iss", "sub", "aud", "iat", "exp", "nonce"], clockTolerance: 30, maxTokenAge: "1 hour" })
  if (payload.nonce !== input.nonce || payload.azp !== undefined && payload.azp !== input.clientId || Array.isArray(payload.aud) && payload.aud.length > 1 && payload.azp !== input.clientId) throw new Error("ID token does not match this sign-in.")
  if (input.provider === "google" && payload.email_verified !== true) throw new Error("Google email is not verified.")
  const email = payload.email ?? payload.preferred_username ?? payload.upn
  if (typeof email !== "string" || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("The sign-in did not include a valid mailbox address.")
  return email
}
