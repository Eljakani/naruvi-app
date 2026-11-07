/**
 * Reads a company from whatever the user has: a name, its website, or its
 * LinkedIn company link. LinkedIn is never fetched: its link only gives a name.
 */
export type CompanyGuess = { name: string; website: string; linkedinUrl: string }

const titleCase = (text: string) => text.split(/\s+/).filter(Boolean).map((word) => word[0].toUpperCase() + word.slice(1)).join(" ")

/** "dashlane.com", "https://www.dashlane.com/fr/careers" → "https://dashlane.com". Empty when it isn't a usable company site. */
export function normalizeWebsite(value: string): string {
  const text = value.trim()
  if (!text) return ""
  try {
    const url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`)
    const host = url.hostname.replace(/^www\./, "").toLowerCase()
    if (!host.includes(".") || /(^|\.)(linkedin\.com|lnkd\.in|indeed\.|welcometothejungle\.com|glassdoor\.)/.test(host)) return ""
    return `https://${host}`
  } catch {
    return ""
  }
}

export function guessCompany(value: string): CompanyGuess {
  const text = value.trim()
  const linkedin = text.match(/linkedin\.com\/(?:company|school|showcase)\/([^/?#]+)/i)
  if (linkedin) {
    const slug = decodeURIComponent(linkedin[1]).replace(/-\d+$/, "")
    return { name: titleCase(slug.replace(/[-_]+/g, " ")), website: "", linkedinUrl: `https://www.linkedin.com/company/${linkedin[1]}` }
  }
  const looksLikeSite = /^(https?:\/\/)?[\w-]+(\.[\w-]+)+(\/|$)/i.test(text) && !/\s/.test(text)
  const website = looksLikeSite ? normalizeWebsite(text) : ""
  if (website) {
    const label = new URL(website).hostname.split(".").slice(-2, -1)[0] ?? ""
    return { name: titleCase(label.replace(/[-_]+/g, " ")), website, linkedinUrl: "" }
  }
  return { name: text, website: "", linkedinUrl: "" }
}
