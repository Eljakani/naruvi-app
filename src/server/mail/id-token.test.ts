import assert from "node:assert/strict"
import test from "node:test"
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from "jose"
import { oauthNonce, verifyMailboxIdToken } from "./id-token"

test("mailbox ID tokens require valid signature, issuer, audience, expiry and nonce", async () => {
  const { privateKey, publicKey } = await generateKeyPair("RS256")
  const jwk = { ...await exportJWK(publicKey), kid: "fixture", alg: "RS256", use: "sig" }
  const keys = createLocalJWKSet({ keys: [jwk] })
  const now = Math.floor(Date.now()/1000)
  const nonce = oauthNonce("fixture-pkce-verifier")
  const input = { provider: "google" as const, clientId: "fixture-client", tenant: "common", nonce }
  const claims = { iss: "https://accounts.google.com", aud: input.clientId, sub: "user", iat: now, exp: now+3600, nonce, email: "owner@example.com", email_verified: true }
  const sign = (overrides: object) => new SignJWT({ ...claims, ...overrides }).setProtectedHeader({ alg: "RS256", kid: "fixture" }).sign(privateKey)
  assert.equal(await verifyMailboxIdToken(await sign({}), input, keys), "owner@example.com")
  for (const bad of [{ iss: "https://evil.example" }, { aud: "other" }, { exp: now-120 }, { nonce: "wrong" }, { nonce: undefined }, { nbf: now+3600 }, { email_verified: false }, { azp: "other" }]) await assert.rejects(verifyMailboxIdToken(await sign(bad), input, keys))
  const other = await generateKeyPair("RS256")
  const forged = await new SignJWT(claims).setProtectedHeader({ alg: "RS256", kid: "fixture" }).sign(other.privateKey)
  await assert.rejects(verifyMailboxIdToken(forged, input, keys))
  const tid = "12345678-1234-1234-1234-123456789abc"
  const microsoft = { ...input, provider: "microsoft" as const, tenant: tid }
  const msToken = await sign({ iss: `https://login.microsoftonline.com/${tid}/v2.0`, tid })
  assert.equal(await verifyMailboxIdToken(msToken, microsoft, keys), "owner@example.com")
  await assert.rejects(verifyMailboxIdToken(msToken, { ...microsoft, tenant: "consumers" }, keys))
})
