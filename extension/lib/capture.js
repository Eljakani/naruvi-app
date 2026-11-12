// Injected into the current tab (only when you ask). Returns what's on screen: the visible
// text and a slimmed copy of the page (no scripts except JSON-LD, no styles, no form values,
// no cookies) so Naruvi can read structured job data as you see it, even behind a login.
export function capturePage() {
  const MAX_HTML = 360_000
  const MAX_TEXT = 110_000
  const main = document.querySelector("main, article, [role=main]") ?? document.body
  const text = (main?.innerText || document.body?.innerText || "").slice(0, MAX_TEXT)

  const slim = (root) => {
    const copy = root.cloneNode(true)
    copy.querySelectorAll("script:not([type='application/ld+json']), style, link[rel=stylesheet], svg, noscript, iframe, canvas, video, audio, template").forEach((node) => node.remove())
    copy.querySelectorAll("input, textarea, select").forEach((node) => node.remove())
    copy.querySelectorAll("*").forEach((node) => {
      for (const attr of [...node.attributes]) {
        if (/^(on|data-|style$|srcset$|aria-(?!label))/i.test(attr.name)) node.removeAttribute(attr.name)
      }
    })
    return copy.outerHTML
  }
  const head = [...document.head.querySelectorAll("title, meta[property], meta[name], link[rel*=icon], link[rel=canonical], script[type='application/ld+json']")].map((node) => node.outerHTML).join("\n")
  let body = slim(main ?? document.body)
  if (head.length + body.length > MAX_HTML) body = body.slice(0, Math.max(0, MAX_HTML - head.length))
  const html = `<!doctype html><html><head>${head}</head><body>${body}</body></html>`

  const ld = [...document.querySelectorAll("script[type='application/ld+json']")].map((node) => node.textContent || "").join("\n")
  const isPosting = /"@type"\s*:\s*"JobPosting"/i.test(ld)
  const meta = (name) => document.querySelector(`meta[property='${name}'], meta[name='${name}']`)?.getAttribute("content") || ""
  const icon = document.querySelector("link[rel~='apple-touch-icon'], link[rel~='icon']")?.href || ""

  // LinkedIn profile: the person, for "save as contact".
  let person = null
  if (/linkedin\.com\/in\//.test(location.href)) {
    const read = (el) => (el?.innerText ?? "").trim()
    const name = read(document.querySelector("main h1")) || document.title.split("|")[0].trim()
    const title = read(document.querySelector("main .text-body-medium"))
    const company = (document.querySelector('main [aria-label^="Current company"], main [aria-label^="Entreprise actuelle"]')?.getAttribute("aria-label") ?? "").replace(/^[^:]+:\s*/, "").replace(/\.\s*Click.*$/i, "").trim()
    const photo = document.querySelector("main img.pv-top-card-profile-picture__image, main img.pv-top-card-profile-picture__image--show")?.src || ""
    person = { name, title: title.slice(0, 160), companyName: company.slice(0, 160), photo }
  }

  return { url: location.href, title: document.title, text, html, isPosting, site: meta("og:site_name") || location.hostname.replace(/^www\./, ""), image: meta("og:image"), icon, person }
}

/** Board URLs that are postings even without JSON-LD. */
export const looksLikePosting = (url) =>
  /linkedin\.com\/jobs\/(view|collections|search)|indeed\.[a-z.]+\/(viewjob|rc\/clk|.*jk=)|welcometothejungle\.com\/.+\/jobs\/|greenhouse\.io\/.+\/jobs\/|lever\.co\/[^/]+\/[0-9a-f-]{20,}|ashbyhq\.com\/[^/]+\/[0-9a-f-]{20,}|workable\.com\/.+\/j\/|smartrecruiters\.com\/[^/]+\/\d+|myworkdayjobs\.com\/.+\/job\/|teamtailor\.com\/jobs\/|recruitee\.com\/o\/|join\.com\/companies\/.+\/\d+|glassdoor\.[a-z.]+\/job-listing|apec\.fr\/.+detail-offre|hellowork\.com\/.+\/emplois\//i.test(url)
