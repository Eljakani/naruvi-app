/**
 * Logo candidates on a company homepage, best first. Pure.
 * Social images (og:image) are usually wide banners, so they rank last and
 * are only accepted later if the downloaded image is nearly square.
 */
export type LogoCandidate = { url: string; priority: number; source: string; strictShape: boolean }

const attr = (tag: string, name: string) => tag.match(new RegExp(`\\s${name}\\s*=\\s*["']([^"']+)["']`, "i"))?.[1] ?? ""

export function siteLogoCandidates(html: string, baseUrl: string): LogoCandidate[] {
  const out: LogoCandidate[] = []
  const push = (href: string, priority: number, source: string, strictShape = false) => {
    if (!href || href.startsWith("data:")) return
    try {
      const url = new URL(href.replace(/&amp;/g, "&").replace(/\\\//g, "/"), baseUrl).toString()
      if (/^https?:/i.test(url)) out.push({ url, priority, source, strictShape })
    } catch {
      // ignore malformed URLs
    }
  }
  const source = String(html ?? "")
  for (const tag of source.match(/<link\b[^>]*>/gi) ?? []) {
    const rel = attr(tag, "rel").toLowerCase()
    const href = attr(tag, "href")
    const sizes = Number(attr(tag, "sizes").split("x")[0]) || 0
    if (rel.includes("apple-touch-icon")) push(href, 100, "apple-touch-icon")
    else if (rel.split(/\s+/).includes("icon")) push(href, /\.svg(\?|$)/i.test(href) ? 80 : sizes >= 96 ? 75 : 30, "icon")
  }
  for (const match of source.matchAll(/"logo"\s*:\s*(?:\{[^}]*?"url"\s*:\s*)?"([^"]+)"/gi)) push(match[1], 95, "json-ld")
  for (const tag of source.match(/<img\b[^>]*>/gi) ?? []) {
    const hint = `${attr(tag, "alt")} ${attr(tag, "class")} ${attr(tag, "src")}`.toLowerCase()
    if (/logo/.test(hint) && !/partner|client|customer|award|badge|powered/.test(hint)) push(attr(tag, "src") || attr(tag, "data-src"), 85, "header-img")
  }
  for (const tag of source.match(/<meta\b[^>]*>/gi) ?? []) {
    const property = (attr(tag, "property") || attr(tag, "name")).toLowerCase()
    if (property === "og:image" || property === "twitter:image") push(attr(tag, "content"), 40, property, true)
  }
  push("/apple-touch-icon.png", 20, "conventional")
  push("/favicon.ico", 15, "favicon")
  try {
    const host = new URL(baseUrl).hostname
    // Last resort: a 128px favicon rendered by a public service.
    push(`https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=128`, 10, "favicon-service")
  } catch {
    // ignore
  }
  const seen = new Set<string>()
  return out.sort((a, b) => b.priority - a.priority).filter((item) => !seen.has(item.url) && seen.add(item.url))
}
