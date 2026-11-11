/**
 * Company website + logo resolution for job postings from any source.
 *
 * A job link is rarely on the company's own domain (Greenhouse, Lever, Ashby,
 * Workday, LinkedIn, Indeed, Welcome to the Jungle, agency sites…), so the
 * page origin is never assumed to be the company website. Candidates are
 * collected from structured data, the description (links, e-mail domains,
 * bare domains) and the URL itself, scored against the company name, and the
 * weak ones are verified by fetching the homepage.
 */

const JOB_HOST_PATTERNS = [
  /(^|\.)linkedin\.com$/, /(^|\.)indeed\./, /(^|\.)glassdoor\./, /(^|\.)welcometothejungle\.com$/, /(^|\.)wttj\.co$/,
  /(^|\.)greenhouse\.io$/, /(^|\.)lever\.co$/, /(^|\.)ashbyhq\.com$/, /(^|\.)smartrecruiters\.com$/,
  /(^|\.)myworkdayjobs\.com$/, /(^|\.)myworkdaysite\.com$/, /(^|\.)workday\.com$/, /(^|\.)workable\.com$/,
  /(^|\.)recruitee\.com$/, /(^|\.)teamtailor\.com$/, /(^|\.)breezy\.hr$/, /(^|\.)jobvite\.com$/,
  /(^|\.)icims\.com$/, /(^|\.)taleo\.net$/, /(^|\.)successfactors\.(com|eu)$/, /(^|\.)jobs\.sap\.com$/,
  /(^|\.)bamboohr\.com$/, /(^|\.)personio\.(de|com)$/, /(^|\.)jobteaser\.com$/, /(^|\.)hellowork\.com$/,
  /(^|\.)apec\.fr$/, /(^|\.)francetravail\.fr$/, /(^|\.)pole-emploi\.fr$/, /(^|\.)monster\./, /(^|\.)stepstone\./,
  /(^|\.)otta\.com$/, /(^|\.)welcome\.to$/, /(^|\.)wellfound\.com$/, /(^|\.)angel\.co$/, /(^|\.)ycombinator\.com$/,
  /(^|\.)jobs\.ch$/, /(^|\.)cadremploi\.fr$/, /(^|\.)meteojob\.com$/, /(^|\.)aplitrak\.com$/, /(^|\.)join\.com$/,
  /(^|\.)dover\.(com|io)$/, /(^|\.)pinpointhq\.com$/, /(^|\.)rippling\.com$/, /(^|\.)gem\.com$/, /(^|\.)eightfold\.ai$/,
  /(^|\.)oraclecloud\.com$/, /(^|\.)ultipro\.com$/, /(^|\.)adp\.com$/, /(^|\.)jazzhr\.com$/, /(^|\.)applytojob\.com$/,
  /(^|\.)google\.com$/, /(^|\.)bing\.com$/, /(^|\.)duckduckgo\.com$/, /(^|\.)facebook\.com$/, /(^|\.)twitter\.com$/,
  /(^|\.)x\.com$/, /(^|\.)instagram\.com$/, /(^|\.)youtube\.com$/, /(^|\.)github\.com$/, /(^|\.)medium\.com$/,
  /(^|\.)wikipedia\.org$/, /(^|\.)crunchbase\.com$/, /(^|\.)cloudfront\.net$/, /(^|\.)amazonaws\.com$/,
  /(^|\.)googleapis\.com$/, /(^|\.)gstatic\.com$/, /(^|\.)w3\.org$/, /(^|\.)schema\.org$/, /(^|\.)gravatar\.com$/,
]

const MULTI_PART_TLDS = new Set(['co.uk', 'org.uk', 'ac.uk', 'com.au', 'co.jp', 'com.br', 'co.in', 'com.fr', 'co.za', 'com.mx', 'co.nz', 'com.sg', 'com.tr'])
const CAREER_SUBDOMAINS = /^(www|careers?|jobs?|job|apply|recruit(ing)?|talent|join|work|team|emplois?|carrieres?|recrutement|hr)$/

export function hostOf(value) {
  try {
    return new URL(String(value)).hostname.toLowerCase().replace(/^www\./, '')
  } catch {
    return ''
  }
}

export function isJobHost(hostOrUrl) {
  const host = /^https?:/i.test(String(hostOrUrl)) ? hostOf(hostOrUrl) : String(hostOrUrl ?? '').toLowerCase()
  return Boolean(host) && JOB_HOST_PATTERNS.some((pattern) => pattern.test(host))
}

export function registrableDomain(host) {
  const labels = String(host ?? '').toLowerCase().replace(/^www\./, '').split('.').filter(Boolean)
  if (labels.length <= 2) return labels.join('.')
  const lastTwo = labels.slice(-2).join('.')
  return MULTI_PART_TLDS.has(lastTwo) ? labels.slice(-3).join('.') : lastTwo
}

function brandLabel(host) {
  const domain = registrableDomain(host)
  const labels = domain.split('.')
  return labels.length >= 2 ? labels[labels.length - (MULTI_PART_TLDS.has(labels.slice(-2).join('.')) ? 3 : 2)] : labels[0] ?? ''
}

function squash(value) {
  return String(value ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\b(inc|llc|ltd|sas|sasu|sa|gmbh|ag|bv|plc|corp|corporation|group|groupe|company|technologies|technology|labs?|hq|io)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, '')
}

/** 0..1: how well a domain matches the company name. */
export function nameMatch(company, host) {
  const name = squash(company)
  const label = squash(brandLabel(host))
  if (!name || !label) return 0
  if (name === label) return 1
  // spotifyjobs.com, acmecareers.com: a recruiting microsite, not the company site.
  if (/(jobs?|careers?|talent|recrut\w*|recruit\w*|hiring)$/.test(label) && label.startsWith(name)) return 0.5
  if (label.length >= 4 && (name.startsWith(label) || label.startsWith(name))) return 0.85
  if (label.length >= 4 && (name.includes(label) || label.includes(name))) return 0.7
  const initials = String(company ?? '').split(/[^A-Za-z0-9]+/).filter(Boolean).map((word) => word[0]).join('').toLowerCase()
  if (initials.length >= 2 && initials === label) return 0.6
  return 0
}

function siteUrlFor(host) {
  // careers.acme.com → https://acme.com; www/jobs subdomains are not the site.
  const labels = host.split('.')
  const domain = registrableDomain(host)
  if (labels.length > domain.split('.').length && !CAREER_SUBDOMAINS.test(labels[0])) return `https://${host}`
  return `https://${domain}`
}

function decode(value) {
  return String(value ?? '').replace(/&amp;/g, '&').replace(/\\\//g, '/')
}

/**
 * Collect website candidates.
 * @param {{company: string, pageUrl?: string, finalUrl?: string, structuredUrls?: string[], html?: string, description?: string}} input
 */
export function companySiteCandidates({ company = '', pageUrl = '', finalUrl = '', structuredUrls = [], html = '', description = '' }) {
  const found = new Map()
  const add = (rawHost, source, base) => {
    const host = String(rawHost ?? '').toLowerCase().replace(/^www\./, '').replace(/\.$/, '')
    if (!host || !host.includes('.') || isJobHost(host) || /\.(png|jpe?g|svg|gif|webp|css|js|pdf)$/.test(host)) return
    const key = registrableDomain(host)
    const match = nameMatch(company, host)
    const score = base + match * 60
    const current = found.get(key)
    if (!current || score > current.score) {
      found.set(key, { url: siteUrlFor(host), host, source, score, match: Number(match.toFixed(2)) })
    } else current.score += 5
  }
  for (const url of structuredUrls.filter(Boolean)) add(hostOf(url), 'structured-data', 40)
  for (const url of [pageUrl, finalUrl].filter(Boolean)) add(hostOf(url), 'posting-url', 30)
  const text = `${description}\n${html}`
  for (const match of decode(text).matchAll(/href=["'](https?:\/\/[^"'\s>]+)["']/gi)) add(hostOf(match[1]), 'link', 8)
  for (const match of text.matchAll(/[\w.+-]+@([a-z0-9-]+(?:\.[a-z0-9-]+)+)/gi)) add(match[1], 'email', 22)
  for (const match of String(description).matchAll(/(?:https?:\/\/|\bwww\.)((?:[a-z0-9-]+\.)+[a-z]{2,12})\b/gi)) {
    add(match[1], 'text', 14)
  }
  for (const match of String(description).matchAll(/\b((?:[a-z0-9-]+\.)+(?:com|io|ai|fr|co|net|org|eu|tech|app|dev|de|uk|ch|be|es|it|nl|cloud|security))\b/gi)) {
    add(match[1], 'text', 12)
  }
  return [...found.values()].sort((a, b) => b.score - a.score)
}

/** A parked or for-sale domain: its page names nothing but the domain itself. */
export function isParkedPage(html) {
  const text = String(html ?? '').slice(0, 60_000)
  return /\b(?:this domain (?:name )?(?:is|may be) for sale|domain (?:name )?is for sale|buy this domain|make an offer on this domain|the domain [^<]{0,60} (?:is|may be) for sale|domain parking|parked (?:free|domain))\b/i.test(text) || /(?:sedo\.com|afternic\.com|dan\.com\/buy|hugedomains\.com|bodis\.com|parkingcrew\.net|above\.com\/marketplace|godaddy\.com\/domainsearch)/i.test(text)
}

/** Domain names in a page ("tiime.com") prove nothing: a parked domain prints its own name everywhere. */
const withoutDomains = (text) => String(text ?? '').replace(/\b[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,6}\b/gi, ' ')

function pageMentions(html, company) {
  const name = squash(company)
  if (!name) return false
  if (isParkedPage(html)) return false
  const head = withoutDomains(String(html ?? '').slice(0, 60_000))
  const title = head.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? ''
  const site = head.match(/og:site_name["'][^>]*content=["']([^"']+)/i)?.[1] ?? ''
  return squash(`${title} ${site}`).includes(name) || squash(head.slice(0, 20_000)).includes(name)
}

/**
 * Pick the company website. Strong name matches are accepted directly; weaker
 * candidates and a `<name>.com` guess are verified by fetching the homepage.
 * Returns { url, source, confidence } — url is '' when nothing is credible.
 */
export async function resolveCompanySite(input, fetchHtml) {
  const company = String(input.company ?? '').trim()
  const candidates = companySiteCandidates(input)
  const strong = candidates.find((item) => item.match >= 1 && item.score >= 60) || candidates.find((item) => item.match >= 0.85 && item.score >= 70)
  if (strong) return { url: strong.url, source: strong.source, confidence: 0.9, candidates: candidates.slice(0, 5) }
  const toVerify = candidates.filter((item) => item.match > 0 || item.source === 'structured-data').slice(0, 3)
  const slug = squash(company)
  if (slug && slug.length >= 3) {
    for (const tld of ['com', 'io', 'fr', 'ai', 'org', 'eu']) {
      if (!toVerify.some((item) => item.host === `${slug}.${tld}`)) toVerify.push({ url: `https://${slug}.${tld}`, host: `${slug}.${tld}`, source: 'guess', match: 1 })
    }
  }
  // Exact brand domains first, then <name>.<tld> guesses, then partial
  // matches such as lifeatspotify.com (a careers microsite).
  const rank = (item) => (item.source === 'guess' ? 1 : item.match >= 1 ? 0 : 2)
  toVerify.sort((a, b) => rank(a) - rank(b))
  if (typeof fetchHtml === 'function') {
    for (const candidate of toVerify.slice(0, 8)) {
      const page = await fetchHtml(candidate.url).catch(() => null)
      if (!page?.html) continue
      const finalHost = hostOf(page.finalUrl || candidate.url)
      if (finalHost && isJobHost(finalHost)) continue
      // A guessed domain that redirects to another brand (emagine.com →
      // emaginehealth.com) belongs to someone else.
      if (candidate.source === 'guess' && finalHost && nameMatch(company, finalHost) < 1) continue
      if (pageMentions(page.html, company)) {
        return { url: candidate.source === 'guess' || !finalHost ? candidate.url : siteUrlFor(finalHost), source: `${candidate.source}+verified`, confidence: candidate.source === 'guess' ? 0.7 : 0.8, candidates: candidates.slice(0, 5) }
      }
    }
  }
  return { url: '', source: 'none', confidence: 0, candidates: candidates.slice(0, 5) }
}

/**
 * Logo candidates printed on the posting itself (ATS headers usually show the
 * employer's uploaded logo). Social/OG images are excluded: they are banners.
 */
export function postingLogoCandidates(html, baseUrl, { company = '', structuredLogo = '' } = {}) {
  const out = []
  const push = (href, priority, source) => {
    if (!href) return
    try {
      const url = new URL(decode(href), baseUrl || undefined).toString()
      if (!/^https?:/i.test(url)) return
      out.push({ url, priority, source })
    } catch {
      // ignore
    }
  }
  push(structuredLogo, 100, 'structured-data')
  const name = squash(company)
  for (const tag of String(html ?? '').match(/<img\b[^>]*>/gi) ?? []) {
    const src = tag.match(/\ssrc=["']([^"']+)["']/i)?.[1] || tag.match(/data-src=["']([^"']+)["']/i)?.[1]
    if (!src || /^data:/i.test(src)) continue
    const alt = tag.match(/\salt=["']([^"']*)["']/i)?.[1] ?? ''
    const cls = tag.match(/\sclass=["']([^"']*)["']/i)?.[1] ?? ''
    const hint = `${alt} ${cls} ${src}`.toLowerCase()
    if (!/logo/.test(hint)) continue
    // Skip the board's own brand (e.g. "Powered by Greenhouse").
    if (/powered|greenhouse-logo|lever-logo|ashby-logo|workday-logo|linkedin-logo|indeed-logo/.test(hint)) continue
    const mentions = name && squash(`${alt} ${src}`).includes(name)
    push(src, mentions ? 95 : /external_greenhouse_job_boards\/logos|lever-client-logos|ashby.*(logo|organization)/i.test(src) ? 92 : 60, 'posting-img')
  }
  const seen = new Set()
  return out.sort((a, b) => b.priority - a.priority).filter((item) => !seen.has(item.url) && seen.add(item.url))
}

/** Width/height from PNG, JPEG, GIF, WebP or ICO bytes; null when unknown (e.g. SVG). */
export function imageSize(buffer) {
  const b = buffer
  if (!b || b.length < 24) return null
  if (b[0] === 0x89 && b[1] === 0x50) return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) }
  if (b.toString('ascii', 0, 4) === 'GIF8') return { width: b.readUInt16LE(6), height: b.readUInt16LE(8) }
  if (b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP') {
    const kind = b.toString('ascii', 12, 16)
    if (kind === 'VP8X') return { width: 1 + b.readUIntLE(24, 3), height: 1 + b.readUIntLE(27, 3) }
    if (kind === 'VP8 ') return { width: b.readUInt16LE(26) & 0x3fff, height: b.readUInt16LE(28) & 0x3fff }
    if (kind === 'VP8L') {
      const bits = b.readUInt32LE(21)
      return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 }
    }
  }
  if (b[0] === 0 && b[1] === 0 && b[2] === 1 && b[3] === 0) return { width: b[6] || 256, height: b[7] || 256 }
  if (b[0] === 0xff && b[1] === 0xd8) {
    let offset = 2
    while (offset + 9 < b.length) {
      if (b[offset] !== 0xff) { offset += 1; continue }
      const marker = b[offset + 1]
      const length = b.readUInt16BE(offset + 2)
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
        return { width: b.readUInt16BE(offset + 7), height: b.readUInt16BE(offset + 5) }
      }
      offset += 2 + length
    }
  }
  return null
}

/** A logo slot is square-ish; banners and screenshots are rejected. */
export function isLogoShaped(buffer, { maxAspect = 3.2, minSide = 24 } = {}) {
  const size = imageSize(buffer)
  if (!size || !size.width || !size.height) return true
  const aspect = size.width / size.height
  if (Math.min(size.width, size.height) < minSide) return false
  return aspect <= maxAspect && aspect >= 1 / maxAspect
}
