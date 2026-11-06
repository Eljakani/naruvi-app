/**
 * OAuth sign-in for Gmail and Microsoft mailboxes (authorization code + PKCE).
 * Pure: provider settings and URL building. The person registers their own
 * app, so tokens never pass through anyone else's servers.
 */
import type { MailServer } from "./mail-providers"

export type OAuthProviderId = "google" | "microsoft"
export type OAuthProvider = {
  id: OAuthProviderId
  name: string
  scopes: string[]
  authorize: (tenant: string) => string
  token: (tenant: string) => string
  extra: Record<string, string>
  server: MailServer
  consoleUrl: string
  steps: string[]
}

export const OAUTH_PROVIDERS: Record<OAuthProviderId, OAuthProvider> = {
  google: {
    id: "google",
    name: "Google",
    scopes: ["openid", "email", "https://mail.google.com/"],
    authorize: () => "https://accounts.google.com/o/oauth2/v2/auth",
    token: () => "https://oauth2.googleapis.com/token",
    extra: { access_type: "offline", prompt: "consent" },
    server: { imapHost: "imap.gmail.com", imapPort: 993, imapSecure: true, smtpHost: "smtp.gmail.com", smtpPort: 465, smtpSecure: true },
    consoleUrl: "https://console.cloud.google.com/apis/credentials",
    steps: [
      "In Google Cloud, create a project and enable the Gmail API.",
      "OAuth consent screen: External, add yourself as a test user (no review needed for personal use).",
      "Credentials → Create credentials → OAuth client ID → Web application. Add the redirect URI below.",
      "Paste the client ID and client secret here.",
    ],
  },
  microsoft: {
    id: "microsoft",
    name: "Microsoft",
    scopes: ["openid", "email", "offline_access", "https://outlook.office.com/IMAP.AccessAsUser.All", "https://outlook.office.com/SMTP.Send"],
    authorize: (tenant) => `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/authorize`,
    token: (tenant) => `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`,
    extra: { prompt: "select_account" },
    server: { imapHost: "outlook.office365.com", imapPort: 993, imapSecure: true, smtpHost: "smtp.office365.com", smtpPort: 587, smtpSecure: false },
    consoleUrl: "https://entra.microsoft.com/#view/Microsoft_AAD_RegisteredApps/ApplicationsListBlade",
    steps: [
      "In Microsoft Entra → App registrations → New registration. Accounts: “any organizational directory and personal Microsoft accounts”.",
      "Redirect URI: platform Web, the address below.",
      "Certificates & secrets → New client secret. API permissions: add IMAP.AccessAsUser.All and SMTP.Send (Office 365 Exchange Online), offline_access, email.",
      "Paste the application (client) ID and the secret value here.",
    ],
  },
}

export const isOAuthProvider = (value: string): value is OAuthProviderId => value === "google" || value === "microsoft"

export function authorizeUrl(provider: OAuthProvider, input: { clientId: string; redirectUri: string; state: string; challenge: string; tenant?: string; loginHint?: string }) {
  const url = new URL(provider.authorize(input.tenant || "common"))
  url.search = new URLSearchParams({
    client_id: input.clientId,
    redirect_uri: input.redirectUri,
    response_type: "code",
    scope: provider.scopes.join(" "),
    state: input.state,
    code_challenge: input.challenge,
    code_challenge_method: "S256",
    ...(input.loginHint ? { login_hint: input.loginHint } : {}),
    ...provider.extra,
  }).toString()
  return url.toString()
}

/** The email in an ID token. Read only (the token came straight from the provider over TLS). */
export function idTokenEmail(idToken: string): string | null {
  try {
    const payload = JSON.parse(Buffer.from(idToken.split(".")[1] ?? "", "base64url").toString("utf8")) as { email?: string; preferred_username?: string; upn?: string }
    const email = payload.email ?? payload.preferred_username ?? payload.upn ?? null
    return email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null
  } catch {
    return null
  }
}
