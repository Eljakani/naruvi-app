/**
 * Deterministic extraction of company facts from one HTML page. Pure.
 * Page content is untrusted data: we only pick text out of it, never act on it.
 */
import { decodeHtml } from "./html"

export type PageFacts = {
  url: string
  title: string
  description: string
  headings: string[]
  /** Sentences that state what the company does, its mission or values. */
  statements: { kind: "mission" | "about" | "values" | "scale" | "founded"; text: string }[]
  values: string[]
  organization: { name?: string; description?: string; foundingDate?: string; employees?: string; locations?: string[]; slogan?: string } | null
}

const MISSION = /\b(our mission|mission is|we exist to|we believe|our purpose|we help|we build|we make|we're on a mission|we are on a mission|notre mission|nous aidons|nous croyons|nuestra misión|unsere mission)\b/i
// A number followed by a counted noun: "300 farms", "2 million users", "40 pays".
const SCALE = /\b\d[\d,.]*\s*\+?\s*(?:million|millions|billion|milliards?|k|thousand|mille)?\s+(?:[a-zà-ÿ-]+\s+)?[a-zà-ÿ-]{3,}s\b/i
const FOUNDED = /\b(founded in|since|established in|fondée? en|créée? en|depuis)\s+(19|20)\d{2}\b/i
const VALUES_HEADING = /\b(our values|core values|values|principles|what we believe|nos valeurs|valeurs|valores|werte)\b/i

/** Visible text; block elements become line breaks so headings never glue onto sentences. */
export const visiblePageText = (html: string) =>
  decodeHtml(
    html
      .replace(/<head[\s\S]*?<\/head>/i, " ")
      .replace(/<(script|style|noscript|svg|template|iframe|nav|footer|form)[^>]*>[\s\S]*?<\/\1>/gi, " ")
      .replace(/<\/?(p|div|h[1-6]|li|ul|ol|section|article|header|br|tr|td|blockquote|dt|dd)\b[^>]*>/gi, "\n")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n[\n ]*/g, "\n")
    .trim()

function meta(html: string, name: string) {
  const pattern = new RegExp(`<meta[^>]+(?:name|property)=["']${name}["'][^>]+content=["']([^"']*)["']|<meta[^>]+content=["']([^"']*)["'][^>]+(?:name|property)=["']${name}["']`, "i")
  const match = html.match(pattern)
  return decodeHtml(match?.[1] ?? match?.[2] ?? "").trim()
}

function organizationLd(html: string): PageFacts["organization"] {
  for (const match of html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const data = JSON.parse(match[1])
      const nodes = [data, ...(Array.isArray(data) ? data : []), ...(Array.isArray(data?.["@graph"]) ? data["@graph"] : [])]
      const org = nodes.find((node) => node && typeof node === "object" && /Organization|Corporation|LocalBusiness|NGO|EducationalOrganization|GovernmentOrganization|MedicalOrganization/.test(String(node["@type"])))
      if (!org) continue
      const address = Array.isArray(org.address) ? org.address : org.address ? [org.address] : []
      const employees = org.numberOfEmployees?.value ?? org.numberOfEmployees?.minValue ?? org.numberOfEmployees
      return {
        name: typeof org.name === "string" ? org.name : undefined,
        description: typeof org.description === "string" ? decodeHtml(org.description).trim() : undefined,
        foundingDate: typeof org.foundingDate === "string" ? org.foundingDate.slice(0, 4) : undefined,
        employees: employees !== undefined && typeof employees !== "object" ? String(employees) : undefined,
        locations: address.map((a: { addressLocality?: string; addressCountry?: string | { name?: string } }) => [a.addressLocality, typeof a.addressCountry === "string" ? a.addressCountry : a.addressCountry?.name].filter(Boolean).join(", ")).filter(Boolean),
        slogan: typeof org.slogan === "string" ? org.slogan : undefined,
      }
    } catch {
      // ignore malformed JSON-LD
    }
  }
  return null
}

function sentences(text: string) {
  return text
    .split(/\n|(?<=[.!?])\s+(?=[A-ZÀ-Ý"“])/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 40 && s.length <= 280 && !/cookie|javascript|browser|sign in|log in|subscribe|newsletter|©|all rights reserved|privacy|accept/i.test(s))
}

/** Bullet items that follow a "values" heading. */
function valuesFrom(html: string): string[] {
  const out: string[] = []
  const pattern = /<h[1-4][^>]*>([\s\S]*?)<\/h[1-4]>([\s\S]{0,4000}?)(?=<h[1-3][^>]*>|$)/gi
  for (const match of html.matchAll(pattern)) {
    if (!VALUES_HEADING.test(visiblePageText(match[1]))) continue
    for (const item of match[2].matchAll(/<(?:li|h[3-6]|strong|dt)[^>]*>([\s\S]*?)<\/(?:li|h[3-6]|strong|dt)>/gi)) {
      const value = visiblePageText(item[1])
      if (value.length >= 3 && value.length <= 120 && !out.includes(value)) out.push(value)
    }
    if (out.length) break
  }
  return out.slice(0, 8)
}

/** Classify standalone sentences (also used for the posting's own text). */
export function classifySentences(text: string, company = "") {
  const ownVoice = new RegExp(`\\b(we|our|us|nous|notre|nos|nuestro|wir|unser)\\b${company ? `|${company.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}` : ""}`, "i")
  const out: PageFacts["statements"] = []
  for (const sentence of sentences(text)) {
    if (MISSION.test(sentence) || /\bmission\b/i.test(sentence) && ownVoice.test(sentence)) out.push({ kind: "mission", text: sentence })
    else if (FOUNDED.test(sentence) && ownVoice.test(sentence)) out.push({ kind: "founded", text: sentence })
    // A number is only a company fact when the company is the subject.
    else if (SCALE.test(sentence) && ownVoice.test(sentence) && !/\b(for example|e\.g\.|par exemple|exemple|donat|faire un don|your gift|ship|orders?|delivery|livraison|returns?|business days|jours ouvr)|[€$£]/i.test(sentence)) out.push({ kind: "scale", text: sentence })
  }
  return out
}

export function extractPage(html: string, url: string): PageFacts {
  const source = String(html ?? "")
  const title = decodeHtml(source.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "").replace(/\s+/g, " ").trim()
  const description = meta(source, "description") || meta(source, "og:description")
  const headings = [...source.matchAll(/<h[12][^>]*>([\s\S]*?)<\/h[12]>/gi)].map((m) => visiblePageText(m[1])).filter((h) => h.length >= 3 && h.length <= 120).slice(0, 12)
  const all = sentences(visiblePageText(source))
  const statements: PageFacts["statements"] = []
  const seen = new Set<string>()
  const push = (kind: PageFacts["statements"][number]["kind"], text: string) => {
    const key = text.toLowerCase().slice(0, 60)
    if (seen.has(key)) return
    seen.add(key)
    statements.push({ kind, text })
  }
  for (const statement of classifySentences(all.join("\n"), organizationLd(source)?.name ?? "")) push(statement.kind, statement.text)
  if (description && description.length >= 30) push("about", description)
  return { url, title, description, headings, statements: statements.slice(0, 12), values: valuesFrom(source), organization: organizationLd(source) }
}
