/** Server settings for common providers, picked from the email address. Anything else: "Other". */
export type MailServer = { imapHost: string; imapPort: number; imapSecure: boolean; smtpHost: string; smtpPort: number; smtpSecure: boolean }
export type MailProvider = { id: string; name: string; domains: string[]; server: MailServer; help: string }

export const MAIL_PROVIDERS: MailProvider[] = [
  { id: "gmail", name: "Gmail", domains: ["gmail.com", "googlemail.com"], server: { imapHost: "imap.gmail.com", imapPort: 993, imapSecure: true, smtpHost: "smtp.gmail.com", smtpPort: 465, smtpSecure: true }, help: "Turn on 2-Step Verification, then create an app password at myaccount.google.com/apppasswords and paste it here." },
  { id: "outlook", name: "Outlook / Microsoft 365", domains: ["outlook.com", "hotmail.com", "live.com", "msn.com", "outlook.fr", "hotmail.fr"], server: { imapHost: "outlook.office365.com", imapPort: 993, imapSecure: true, smtpHost: "smtp.office365.com", smtpPort: 587, smtpSecure: false }, help: "Use an app password (account.microsoft.com → Security → Advanced security options). Some work accounts block IMAP; ask your admin." },
  { id: "icloud", name: "iCloud Mail", domains: ["icloud.com", "me.com", "mac.com"], server: { imapHost: "imap.mail.me.com", imapPort: 993, imapSecure: true, smtpHost: "smtp.mail.me.com", smtpPort: 587, smtpSecure: false }, help: "Create an app-specific password at appleid.apple.com → Sign-In and Security." },
  { id: "fastmail", name: "Fastmail", domains: ["fastmail.com", "fastmail.fm"], server: { imapHost: "imap.fastmail.com", imapPort: 993, imapSecure: true, smtpHost: "smtp.fastmail.com", smtpPort: 465, smtpSecure: true }, help: "Create an app password in Settings → Privacy & Security → Integrations." },
  { id: "yahoo", name: "Yahoo Mail", domains: ["yahoo.com", "yahoo.fr", "ymail.com"], server: { imapHost: "imap.mail.yahoo.com", imapPort: 993, imapSecure: true, smtpHost: "smtp.mail.yahoo.com", smtpPort: 465, smtpSecure: true }, help: "Generate an app password in Account security." },
  { id: "proton", name: "Proton Mail (Bridge)", domains: ["proton.me", "protonmail.com", "pm.me"], server: { imapHost: "127.0.0.1", imapPort: 1143, imapSecure: false, smtpHost: "127.0.0.1", smtpPort: 1025, smtpSecure: false }, help: "Run Proton Mail Bridge on this computer and use the password it shows (not your Proton password)." },
]

export const OTHER_PROVIDER: MailProvider = { id: "other", name: "Other (IMAP/SMTP)", domains: [], server: { imapHost: "", imapPort: 993, imapSecure: true, smtpHost: "", smtpPort: 465, smtpSecure: true }, help: "Find the IMAP and SMTP server names in your provider’s help pages. Use an app password if your provider offers one." }

export function providerFor(email: string): MailProvider {
  const domain = email.split("@")[1]?.toLowerCase().trim() ?? ""
  return MAIL_PROVIDERS.find((provider) => provider.domains.includes(domain)) ?? OTHER_PROVIDER
}
