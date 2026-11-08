import assert from "node:assert/strict"
import test from "node:test"
import { authorizeUrl, OAUTH_PROVIDERS } from "./oauth"

test("authorization URLs carry PKCE, offline access and the mail scopes", () => {
  const url = new URL(authorizeUrl(OAUTH_PROVIDERS.google, { clientId: "abc", redirectUri: "http://localhost:3000/api/oauth/google/callback", state: "s1", challenge: "c1", loginHint: "me@gmail.com" }))
  assert.equal(url.origin + url.pathname, "https://accounts.google.com/o/oauth2/v2/auth")
  assert.equal(url.searchParams.get("code_challenge_method"), "S256")
  assert.equal(url.searchParams.get("access_type"), "offline")
  assert.match(url.searchParams.get("scope")!, /https:\/\/mail\.google\.com\//)
  assert.equal(url.searchParams.get("login_hint"), "me@gmail.com")
  const ms = new URL(authorizeUrl(OAUTH_PROVIDERS.microsoft, { clientId: "abc", redirectUri: "http://localhost:3000/x", state: "s", challenge: "c", tenant: "consumers" }))
  assert.equal(ms.pathname, "/consumers/oauth2/v2.0/authorize")
  assert.match(ms.searchParams.get("scope")!, /offline_access/)
})
