/* Vendored from CV Studio; keep in sync deliberately. */
/* eslint-disable @typescript-eslint/no-unused-vars */
/**
 * Job-posting parser.
 *
 * The goal is to turn any public job URL into the same structured object:
 * company, role, location, salary, remote policy, language, description and
 * provenance. It prefers structured data (JSON-LD, LinkedIn's guest endpoint,
 * Greenhouse/Lever/Ashby/SmartRecruiters JSON) and only then falls back to
 * metadata and heuristics.
 *
 * Everything here is pure: network fetching lives in the host plugin.
 */

const JOB_BOARDS = /linkedin|indeed|glassdoor|welcometothejungle|aplitrak|monster|stepstone|hellowork|helloWork/i
const JOB_BOARD_NAMES = /^(linkedin|indeed|glassdoor|welcometothejungle|greenhouse|lever|ashby|smartrecruiters|workday|monster|stepstone)$/i
const ATS_HOSTS = /greenhouse|lever\.co|ashbyhq|smartrecruiters|workable|recruitee|teamtailor|breezy|jobvite|workday/i

const ROLE_WORDS =
  /\b(engineer|developer|devops|sre|architect|scientist|analyst|consultant|manager|lead|director|intern|internship|specialist|designer|administrator|technician|security|cloud|data|product|platform|software|frontend|backend|full[ -]?stack|stage|alternance|ingénieur|ingénieure|développeur|développeuse|consultant|consultante|architecte|analyste|chef|responsable|stagiaire|expert)\b/i

const MONTHS = {
  jan: '01', january: '01', janvier: '01',
  feb: '02', february: '02', février: '02', fevrier: '02',
  mar: '03', march: '03', mars: '03',
  apr: '04', april: '04', avril: '04',
  may: '05', mai: '05',
  jun: '06', june: '06', juin: '06',
  jul: '07', july: '07', juillet: '07',
  aug: '08', august: '08', août: '08', aout: '08',
  sep: '09', sept: '09', september: '09', septembre: '09',
  oct: '10', october: '10', octobre: '10',
  nov: '11', november: '11', novembre: '11',
  dec: '12', december: '12', décembre: '12', decembre: '12',
}

const ENTITY_MAP = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  ndash: '–',
  mdash: '—',
  hellip: '…',
  rsquo: '’',
  lsquo: '‘',
  ldquo: '“',
  rdquo: '”',
  bull: '•',
  euro: '€',
  pound: '£',
  copy: '©',
}

export function parseJobUrl(rawUrl) {
  let url
  try {
    url = new URL(String(rawUrl ?? '').trim())
  } catch {
    return { url: String(rawUrl ?? ''), host: '', board: 'generic', jobId: null, companySlug: '', canonical: String(rawUrl ?? '') }
  }
  const host = url.hostname.toLowerCase().replace(/^www\./, '')
  let board = 'generic'
  let jobId = null
  let companySlug = ''
  const parts = url.pathname.split('/').filter(Boolean)

  if (host === 'linkedin.com' || host.endsWith('.linkedin.com')) {
    board = 'linkedin'
    jobId =
      url.searchParams.get('currentJobId') ||
      url.pathname.match(/\/jobs\/view\/(?:[^/]+-)?(\d+)/)?.[1] ||
      url.pathname.match(/\/jobPosting\/(\d+)/)?.[1] ||
      null
    if (jobId) {
      url.pathname = `/jobs/view/${jobId}/`
      url.search = ''
    }
  } else if (host === 'boards.greenhouse.io' || host === 'job-boards.greenhouse.io') {
    board = 'greenhouse'
    companySlug = url.searchParams.get('for') || parts[0] || ''
    jobId = url.searchParams.get('token') || url.pathname.match(/\/jobs\/(\d+)/)?.[1] || null
  } else if (host === 'jobs.lever.co') {
    board = 'lever'
    companySlug = parts[0] ?? ''
    jobId = parts[1] ?? null
  } else if (host === 'jobs.ashbyhq.com') {
    board = 'ashby'
    companySlug = parts[0] ?? ''
    jobId = parts[1] ?? null
  } else if (host === 'jobs.smartrecruiters.com') {
    board = 'smartrecruiters'
    companySlug = parts[0] ?? ''
    jobId = parts[1] ?? null
  } else if (/(^|\.)myworkdayjobs\.com$/.test(host)) {
    board = 'workday'
    companySlug = host.split('.')[0] ?? ''
  } else if (/\.recruitee\.com$/.test(host)) {
    board = 'recruitee'
    companySlug = host.split('.')[0] ?? ''
  } else if (/\.teamtailor\.com$/.test(host)) {
    board = 'teamtailor'
    companySlug = host.split('.')[0] ?? ''
  } else if (host === 'apply.workable.com') {
    board = 'workable'
    companySlug = parts[0] ?? ''
    jobId = parts[2] ?? null
  } else if (/\.breezy\.hr$/.test(host)) {
    board = 'breezy'
    companySlug = host.split('.')[0] ?? ''
  } else if (JOB_BOARDS.test(host)) {
    board = 'job-board'
  }

  return {
    url: url.toString(),
    host,
    board,
    jobId,
    companySlug,
    canonical: cleanJobUrl(url.toString()),
  }
}

export function cleanJobUrl(raw) {
  try {
    const url = new URL(raw)
    for (const key of [...url.searchParams.keys()]) {
      if (/^(utm_|trk|tracking|ref|referrer|source|gh_src|lever-source|iis|iisn)/i.test(key)) {
        url.searchParams.delete(key)
      }
    }
    return url.toString()
  } catch {
    return String(raw ?? '')
  }
}

export function apiCandidates(rawUrl) {
  const info = parseJobUrl(rawUrl)
  const out = []
  if (info.board === 'linkedin' && info.jobId) {
    out.push({ url: `https://www.linkedin.com/jobs-guest/jobs/api/jobPosting/${info.jobId}`, kind: 'linkedin' })
  }
  if (info.board === 'greenhouse' && info.companySlug && info.jobId) {
    out.push({
      url: `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(info.companySlug)}/jobs/${encodeURIComponent(info.jobId)}?content=true`,
      kind: 'greenhouse',
    })
  }
  if (info.board === 'lever' && info.companySlug && info.jobId) {
    out.push({
      url: `https://api.lever.co/v0/postings/${encodeURIComponent(info.companySlug)}/${encodeURIComponent(info.jobId)}`,
      kind: 'lever',
    })
  }
  if (info.board === 'ashby' && info.companySlug) {
    out.push({
      url: `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(info.companySlug)}?includeCompensation=true`,
      kind: 'ashby',
    })
  }
  if (info.board === 'smartrecruiters' && info.companySlug && info.jobId) {
    out.push({
      url: `https://api.smartrecruiters.com/v1/companies/${encodeURIComponent(info.companySlug)}/postings/${encodeURIComponent(info.jobId)}`,
      kind: 'smartrecruiters',
    })
  }
  return out
}

export function parseJobDocument({ html = '', url = '', text = '' } = {}) {
  const info = parseJobUrl(url)
  const ld = findJobPostingLd(html)
  const linkedin = info.board === 'linkedin' ? parseLinkedInHtml(html) : {}
  const meta = parseMeta(html)
  const titleSource = ld?.title || linkedin.title || meta.h1 || meta.ogTitle || meta.title || ''
  const titleParts = parseTitleParts(titleSource)
  const description =
    ld?.description ||
    linkedin.description ||
    extractMainText(html) ||
    meta.ogDescription ||
    String(text ?? '').trim()
  const role = cleanTitle(ld?.title || linkedin.title || titleParts.role || meta.h1 || meta.title || '')
  const company =
    cleanCompany(ld?.company || linkedin.company || titleParts.company || meta.siteName || '') ||
    companyFromHost(info)
  // Never assume the posting's own origin is the company website; the
  // company resolver scores it as one weak candidate among others.
  const companyUrl = ld?.companyUrl || ''
  const location = ld?.location || linkedin.location || meta.location || ''
  const salary = ld?.salary || linkedin.salary || extractSalary(description) || ''
  const remote = ld?.remote || linkedin.remote || extractRemote(`${location} ${description}`)
  // The title says what the job is ("… Intern"); the text may mention another contract in passing ("a full-time start date").
  const employmentType = ld?.employmentType || linkedin.employmentType || extractEmploymentType(role) || extractEmploymentType(description)
  const postedAt = ld?.postedAt || linkedin.postedAt || ''
  const language = ld?.language || detectLanguage(`${titleSource} ${description}`)
  const descriptionText = cleanJobText(description)
  const warnings = []
  if (!role) warnings.push('Role title was not detected; edit it before creating the offer.')
  if (!company) warnings.push('Company was not detected; edit it before creating the offer.')
  if (descriptionText.length < 180) {
    warnings.push('Only a short description was extracted. Paste the full text if the page is behind a login wall.')
  }
  if (/authwall|sign in to view|captcha|access denied|enable javascript/i.test(String(text || html))) {
    warnings.push('The site may be showing a login or bot wall. Check the extracted text before continuing.')
  }

  return finalizeMeta({
    company,
    role,
    companyUrl,
    location,
    salary,
    remote,
    employmentType,
    postedAt,
    validThrough: ld?.validThrough || '',
    companyLogo: ld?.companyLogo || '',
    companyLinks: ld?.companyLinks || [],
    jobId: ld?.jobId || info.jobId || '',
    board: info.board,
    source: ld ? 'json-ld' : linkedin.description ? 'linkedin' : 'html',
    language,
    applyUrl: ld?.applyUrl || linkedin.applyUrl || info.canonical || url,
    description: descriptionText,
    warnings,
    structured: Boolean(ld || linkedin.description),
  })
}

export function parseJobApi(kind, data, url) {
  const info = parseJobUrl(url)
  let record = data
  if (kind === 'ashby') {
    const jobs = Array.isArray(data?.jobs) ? data.jobs : Array.isArray(data) ? data : []
    record =
      jobs.find((job) => info.jobId && String(job.id) === String(info.jobId)) ||
      jobs[0] ||
      data
  }
  if (kind === 'smartrecruiters' && record?.content) record = record.content
  if (!record || typeof record !== 'object') {
    throw new Error(`The ${kind} response did not contain a job posting.`)
  }

  let company = ''
  let role = ''
  let description = ''
  let location = ''
  let salary = ''
  let employmentType = ''
  let postedAt = ''
  let applyUrl = url
  let jobId = info.jobId || ''
  let companyUrl = ''

  if (kind === 'greenhouse') {
    company = record.company_name || ''
    role = record.title || ''
    description = record.content || ''
    location = locationText(record.location)
    postedAt = record.updated_at || record.first_published || ''
    applyUrl = record.absolute_url || url
    companyUrl = record.company_url || ''
    jobId = String(record.id ?? jobId)
  } else if (kind === 'lever') {
    company = companyFromHost(info) || info.companySlug
    role = record.text || ''
    location = record.categories?.location || ''
    employmentType = record.categories?.commitment || ''
    postedAt = record.createdAt || ''
    applyUrl = record.hostedUrl || url
    jobId = record.id || jobId
    description = [
      record.description || '',
      ...(Array.isArray(record.lists) ? record.lists.map((list) => `<h3>${list.text || ''}</h3>${list.content || ''}`) : []),
      record.additional || '',
    ].join('\n')
  } else if (kind === 'ashby') {
    company = companyFromHost(info) || info.companySlug || ''
    role = record.title || ''
    description = record.descriptionHtml || record.descriptionPlain || ''
    location = locationText(record.location)
    employmentType = record.employmentType || ''
    postedAt = record.publishedAt || ''
    applyUrl = record.jobUrl || url
    jobId = record.id || jobId
    salary = record.compensation?.compensationTierSummary || ''
    if (record.isRemote) location = location || 'Remote'
  } else if (kind === 'smartrecruiters') {
    company = record.company?.name || info.companySlug || ''
    role = record.name || ''
    location = record.location?.fullLocation || [record.location?.city, record.location?.region, String(record.location?.country ?? '').toUpperCase()].filter(Boolean).join(', ')
    if (record.location?.remote) location = `${location} (remote)`.trim()
    else if (record.location?.hybrid) location = `${location} (hybrid)`.trim()
    postedAt = record.releasedDate || ''
    applyUrl = record.ref || url
    jobId = String(record.id ?? jobId)
    const sections = record.jobAd?.sections || {}
    description = [
      sections.companyDescription,
      sections.jobDescription,
      sections.qualifications,
      sections.additionalInformation,
    ]
      // Sections are { title, text } objects in the public API.
      .map((section) => (typeof section === 'string' ? section : section?.text ? `<h3>${section.title ?? ''}</h3>${section.text}` : ''))
      .filter(Boolean)
      .join('\n')
    companyUrl = /\./.test(record.company?.identifier ?? '') ? `https://${record.company.identifier}` : ''
  } else if (kind === 'linkedin') {
    return parseJobDocument({ html: typeof data === 'string' ? data : '', url, text: '' })
  } else {
    throw new Error(`Unsupported ATS: ${kind}`)
  }

  const descriptionText = cleanJobText(description)
  const warnings = []
  if (!role) warnings.push('Role title was not detected in the ATS response.')
  if (!company) warnings.push('Company was not detected in the ATS response.')
  if (descriptionText.length < 180) warnings.push('The ATS response contained only a short description.')

  return finalizeMeta({
    company: cleanCompany(company) || companyFromHost(info),
    role: cleanTitle(role),
    companyUrl,
    location: locationText(location),
    salary,
    remote: extractRemote(`${location} ${descriptionText}`),
    employmentType,
    postedAt,
    jobId,
    board: info.board,
    source: kind,
    language: detectLanguage(`${role} ${descriptionText}`),
    applyUrl,
    description: descriptionText,
    warnings,
    structured: true,
  })
}

export function detectLanguage(text, hint = '') {
  const lang = String(hint).toLowerCase()
  if (lang.startsWith('fr')) return 'fr'
  if (lang.startsWith('en')) return 'en'
  const value = String(text ?? '').toLowerCase()
  const french = (value.match(/\b(le|la|les|des|du|de|et|pour|avec|nous|vous|recherchons|entreprise|poste|missions|profil|compétences|équipe|chez|une|un|dans|sur|est|sont)\b/g) ?? []).length
  const english = (value.match(/\b(the|and|with|for|you|we|our|your|role|team|experience|skills|requirements|responsibilities|at|in|on|is|are)\b/g) ?? []).length
  if (french > english * 1.2) return 'fr'
  return 'en'
}

function findJobPostingLd(html) {
  const matches = [...String(html ?? '').matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)]
  for (const match of matches) {
    let parsed
    try {
      parsed = JSON.parse(match[1].trim())
    } catch {
      continue
    }
    const nodes = []
    const visit = (node) => {
      if (!node) return
      if (Array.isArray(node)) {
        node.forEach(visit)
        return
      }
      if (typeof node !== 'object') return
      if (Array.isArray(node['@graph'])) node['@graph'].forEach(visit)
      nodes.push(node)
    }
    visit(parsed)
    const job = nodes.find((node) => {
      const types = Array.isArray(node['@type']) ? node['@type'] : [node['@type']]
      return types.some((type) => String(type).toLowerCase() === 'jobposting')
    })
    if (job) return normalizeLdJob(job)
  }
  return null
}

function normalizeLdJob(job) {
  const org = job.hiringOrganization || {}
  const locations = [...asArray(job.jobLocation), ...asArray(job.applicantLocationRequirements)]
    .map((place) => locationText(place?.address || place))
    .filter(Boolean)
  const location = [...new Set(locations)].join(' · ')
  const remote = /TELECOMMUTE/i.test(String(job.jobLocationType ?? '')) ? 'Remote' : ''
  const salary = salaryText(job.baseSalary)
  const types = asArray(job.employmentType)
    .map((type) => employmentLabel(type))
    .filter(Boolean)
  const description = cleanJobText(job.description || '')
  const company = textValue(org.name)
  const companyUrl = textValue(org.url)
  const logo = textValue(org.logo?.url ?? org.logo?.contentUrl ?? org.logo)
  const sameAs = asArray(org.sameAs).map((value) => textValue(value)).filter(Boolean)
  const jobId = textValue(job.identifier?.value ?? job.identifier)
  return {
    title: textValue(job.title),
    company,
    companyUrl,
    companyLogo: logo,
    companyLinks: [companyUrl, ...sameAs].filter(Boolean),
    location,
    salary,
    remote,
    employmentType: [...new Set(types)].join(', '),
    postedAt: textValue(job.datePosted),
    validThrough: textValue(job.validThrough),
    language: String(job.inLanguage ?? '').slice(0, 2).toLowerCase(),
    jobId,
    applyUrl: textValue(job.url) || '',
    description,
  }
}

function parseLinkedInHtml(html) {
  const title =
    classText(html, 'top-card-layout__title') ||
    classText(html, 'topcard__title') ||
    tagText(html, 'h1')
  const company =
    classText(html, 'topcard__org-name-link') ||
    classText(html, 'top-card-layout__second-subline a') ||
    ''
  const location =
    classText(html, 'topcard__flavor--location') ||
    classText(html, 'topcard__flavor--bullet') ||
    ''
  const description =
    classText(html, 'description__text') ||
    classText(html, 'show-more-less-html__markup') ||
    ''
  const postedAt =
    classText(html, 'posted-time-ago__text') ||
    classText(html, 'posted-time-ago__text--new') ||
    ''
  const orgHref = String(html ?? '').match(/<a[^>]+class=["'][^"']*topcard__org-name-link[^"']*["'][^>]+href=["']([^"']+)["']/i)?.[1] || ''
  return {
    title: cleanTitle(title),
    company: cleanCompany(company),
    companyUrl: orgHref,
    location: locationText(location),
    description: cleanJobText(description),
    postedAt,
  }
}

function parseMeta(html) {
  const source = String(html ?? '')
  const attrs = (name) => {
    const patterns = [
      new RegExp(`<meta[^>]+(?:property|name)=["']${name}["'][^>]+content=["']([^"']*)["']`, 'i'),
      new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']${name}["']`, 'i'),
    ]
    for (const pattern of patterns) {
      const match = source.match(pattern)
      if (match) return decodeEntities(match[1])
    }
    return ''
  }
  const title = decodeEntities(source.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '')
  const h1 = tagText(source, 'h1')
  const lang = decodeEntities(source.match(/<html[^>]+lang=["']([^"']+)["']/i)?.[1] || '')
  const canonical = source.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i)?.[1] || ''
  const origin = source.match(/<meta[^>]+property=["']og:url["'][^>]+content=["']([^"']+)["']/i)?.[1] || canonical
  return {
    title: title.trim(),
    h1: h1.trim(),
    ogTitle: attrs('og:title').trim(),
    ogDescription: attrs('og:description').trim(),
    siteName: attrs('og:site_name').trim(),
    description: attrs('description').trim(),
    lang,
    origin,
    location: attrs('job:location') || attrs('location') || '',
  }
}

function parseTitleParts(raw) {
  let title = cleanTitle(raw)
    .replace(/\s*[|·]\s*(linkedin|indeed|glassdoor|greenhouse|lever|ashby|smartrecruiters|workday).*$/i, '')
    .replace(/\s*[-–]\s*(job description|offre d'emploi|careers?|jobs?)\s*$/i, '')
    .trim()
  if (!title) return { role: '', company: '' }
  const at = title.match(/^(.+?)\s+(?:at|chez|@)\s+(.+)$/i)
  if (at) return { role: cleanTitle(at[1]), company: cleanCompany(at[2]) }
  const hiring = title.match(/^(.+?)\s+(?:is\s+)?hiring\s+(?:an?|un|une)?\s*(.+)$/i)
  if (hiring) return { role: cleanTitle(hiring[2]), company: cleanCompany(hiring[1]) }
  // "Role - Team | Company Careers": the pipe separates the site from the title; a dash before it belongs to the role.
  const piped = title.split(/\s*\|\s*/).filter(Boolean)
  if (piped.length >= 2) {
    const first = cleanTitle(piped[0])
    const last = cleanTitle(piped[piped.length - 1])
    const roleFirst = ROLE_WORDS.test(first) || !ROLE_WORDS.test(last)
    return { role: roleFirst ? first : last, company: cleanCompany(roleFirst ? last : first) }
  }
  const dash = title.match(/^(.+?)\s*[-–]\s*(.+)$/)
  if (dash) {
    const left = cleanTitle(dash[1])
    const right = cleanTitle(dash[2])
    if (ROLE_WORDS.test(left) && !ROLE_WORDS.test(right)) return { role: left, company: cleanCompany(right) }
    if (!ROLE_WORDS.test(left) && ROLE_WORDS.test(right)) return { role: right, company: cleanCompany(left) }
    return { role: left, company: cleanCompany(right) }
  }
  return { role: title, company: '' }
}

function companyFromHost(info) {
  if (!info?.host) return ''
  if (info.board === 'linkedin' || info.board === 'job-board') return ''
  if (info.companySlug) return titleCase(cleanCompany(info.companySlug))
  const host = info.host
  const labels = host.split('.')
  if (labels.length >= 3 && /^(careers|jobs|job|apply|recruit|talent|www)$/.test(labels[0])) {
    return titleCase(cleanCompany(labels[1]))
  }
  if (labels.length >= 2) return titleCase(cleanCompany(labels[labels.length - 2]))
  return titleCase(cleanCompany(labels[0]))
}

function finalizeMeta(meta) {
  const description = cleanJobText(meta.description || '')
  const company = cleanCompany(meta.company || '')
  const role = cleanTitle(meta.role || '')
  const language = meta.language === 'fr' ? 'fr' : meta.language === 'en' ? 'en' : detectLanguage(`${role} ${description}`)
  const warnings = [...new Set((meta.warnings ?? []).filter(Boolean))]
  let confidence = 0
  if (role) confidence += 0.24
  if (company) confidence += 0.2
  if (description.length >= 180) confidence += 0.25
  if (meta.location) confidence += 0.1
  if (meta.salary) confidence += 0.05
  if (meta.postedAt) confidence += 0.05
  if (meta.structured) confidence += 0.11
  confidence = Math.min(0.99, confidence)
  return {
    company,
    role,
    companyUrl: normalizeUrl(meta.companyUrl || ''),
    companyLogo: normalizeUrl(meta.companyLogo || ''),
    companyLinks: [...new Set((meta.companyLinks ?? []).map((value) => normalizeUrl(value)).filter(Boolean))],
    location: cleanText(meta.location || ''),
    salary: cleanText(meta.salary || ''),
    remote: cleanText(meta.remote || ''),
    employmentType: cleanText(meta.employmentType || ''),
    postedAt: cleanText(meta.postedAt || ''),
    validThrough: cleanText(meta.validThrough || ''),
    jobId: String(meta.jobId ?? ''),
    board: meta.board || 'generic',
    source: meta.source || 'html',
    language,
    applyUrl: normalizeUrl(meta.applyUrl || ''),
    description,
    confidence: Number(confidence.toFixed(2)),
    warnings,
  }
}

function extractMainText(html) {
  const source = String(html ?? '')
  if (!source) return ''
  const candidates = []
  for (const pattern of [
    /<div[^>]+class=["'][^"']*(?:description__text|show-more-less-html__markup|job-description|jobDescription|posting-page)[^"']*["'][^>]*>([\s\S]*?)<\/div>/i,
    /<main[^>]*>([\s\S]*?)<\/main>/i,
    /<article[^>]*>([\s\S]*?)<\/article>/i,
    /<body[^>]*>([\s\S]*?)<\/body>/i,
  ]) {
    const match = source.match(pattern)
    if (match) candidates.push(match[1])
  }
  for (const candidate of candidates) {
    const text = cleanJobText(candidate)
    if (text.length >= 250) return candidate
  }
  return candidates[0] || ''
}

function extractSalary(text) {
  const value = String(text ?? '')
  const contextual =
    value.match(/(?:salary|compensation|package|pay|rémunération|salaire)\s*[:\-–]?\s*((?:€|\$|£)\s?[\d.,]+(?:\s?[kK])?(?:\s*[-–]\s*(?:€|\$|£)?\s?[\d.,]+(?:\s?[kK])?)?(?:\s*(?:per|\/|a)\s*(?:year|annum|month|day|hour))?)/i)?.[1] ||
    value.match(/((?:€|\$|£)\s?\d[\d.,]*\s?[kK]?\s*[-–]\s*(?:€|\$|£)?\s?\d[\d.,]*\s?[kK]?(?:\s*(?:per|\/|a)\s*(?:year|annum|month|day|hour))?)/i)?.[1]
  return value ? cleanText(contextual || '') : ''
}

function extractRemote(text) {
  const value = String(text ?? '')
  if (/\b(hybrid|hybride)\b/i.test(value)) return 'Hybrid'
  if (/\b(remote|télétravail|teletravail|work from home|full remote)\b/i.test(value)) return 'Remote'
  if (/\b(on[- ]site|sur site|présentiel|presentiel)\b/i.test(value)) return 'On-site'
  return ''
}

function extractEmploymentType(text) {
  const value = String(text ?? '')
  // Only explicit contract vocabulary: "mission" or "contract" alone appear in
  // ordinary prose ("our mission is…"), so they are not evidence.
  if (/\b(full[- ]time|cdi|permanent contract|permanent position|temps plein)\b/i.test(value)) return 'Full-time'
  if (/\b(cdd|fixed[- ]term)\b/i.test(value)) return 'Fixed-term'
  if (/\b(part[- ]time|temps partiel)\b/i.test(value)) return 'Part-time'
  if (/\b(internship|intern|stagiaire|stage de fin d'[ée]tudes|alternance|alternant|apprenticeship)\b/i.test(value)) return 'Internship'
  if (/\b(freelance|contractor|contract (?:role|position|basis)|portage salarial)\b/i.test(value)) return 'Contract'
  return ''
}

function salaryText(baseSalary) {
  if (!baseSalary) return ''
  const value = baseSalary.value ?? baseSalary
  const numeric = typeof value === 'number'
  const currency = baseSalary.currency || value?.currency || ''
  const unit = value?.unitText || baseSalary.unitText || ''
  const min = numeric ? value : value?.minValue ?? value?.value
  const max = numeric ? null : value?.maxValue ?? null
  if (min == null && max == null) return ''
  const symbols = { EUR: '€', USD: '$', GBP: '£' }
  const symbol = symbols[String(currency).toUpperCase()] || currency || ''
  const fmt = (num) => Number(num).toLocaleString('en-US')
  const amount = max != null && min != null && Number(max) !== Number(min) ? `${fmt(min)}–${fmt(max)}` : fmt(min ?? max)
  return `${symbol}${amount}${unit ? ` / ${String(unit).toLowerCase()}` : ''}`.trim()
}

function locationText(value) {
  if (!value) return ''
  if (typeof value === 'string') return cleanText(value)
  if (Array.isArray(value)) return value.map(locationText).filter(Boolean).join(' · ')
  if (typeof value === 'object') {
    const address = value.address || value
    const parts = [
      address.addressLocality,
      address.addressRegion,
      address.addressCountry?.name || address.addressCountry,
      value.name,
    ]
      .map((part) => textValue(part))
      .filter(Boolean)
    return [...new Set(parts)].join(', ')
  }
  return ''
}

function employmentLabel(value) {
  const map = {
    FULL_TIME: 'Full-time',
    PART_TIME: 'Part-time',
    CONTRACTOR: 'Contract',
    TEMPORARY: 'Temporary',
    INTERN: 'Internship',
    VOLUNTEER: 'Volunteer',
    PER_DIEM: 'Per diem',
    OTHER: 'Other',
  }
  const key = String(value ?? '').toUpperCase().replace(/[ -]/g, '_')
  return map[key] || cleanText(String(value ?? ''))
}

function cleanJobText(value) {
  const source = String(value ?? '')
  if (/<[a-z][\s\S]*>/i.test(source)) {
    return cleanHtml(source)
  }
  // Keep paragraph and list structure: descriptions are cleaned more than
  // once (API parse, then finalize) and must not collapse into one line.
  return decodeEntities(source)
    .replace(/\r/g, '')
    .replace(/[^\S\n]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/ +([,.;:!?])/g, '$1')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function cleanHtml(html) {
  return decodeEntities(
    String(html ?? '')
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/<(script|style|noscript|svg|canvas|template|iframe|form|nav|footer|header|aside)[^>]*>[\s\S]*?<\/\1>/gi, ' ')
      // Keep e-mail addresses hidden behind link text ("contact us here").
      .replace(/<a\b[^>]*href=["']mailto:([^"'?\s]+)[^"']*["'][^>]*>([\s\S]*?)<\/a>/gi, (_, email, label) =>
        label.includes(email) ? label : `${label} (${email})`,
      )
      .replace(/<(br|hr)\s*\/?>/gi, '\n')
      .replace(/<li[^>]*>/gi, '\n- ')
      .replace(/<\/(p|div|section|article|li|ul|ol|h[1-6]|tr|table|blockquote|pre)>/gi, '\n')
      .replace(/<h[1-6][^>]*>/gi, '\n### ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/[ \t\f\v]+/g, ' ')
      .replace(/ *\n */g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim(),
  )
}

function cleanText(value) {
  return decodeEntities(String(value ?? ''))
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.;:!?])/g, '$1')
    .trim()
}

function cleanTitle(value) {
  return cleanText(value)
    .replace(/\s*\((?:m\/f\/d|h\/f|f\/h|w\/m\/d)\)\s*/gi, ' ')
    .replace(/\s*[|·]\s*(linkedin|indeed|glassdoor|greenhouse|lever|ashby|smartrecruiters|workday).*$/i, '')
    .replace(/^job\s*[:\-]\s*/i, '')
    .trim()
}

function cleanCompany(value) {
  const company = cleanText(value)
    .replace(/\s*[|·]\s*(linkedin|indeed|glassdoor|greenhouse|lever|ashby|smartrecruiters|workday).*$/i, '')
    .replace(/^(company|entreprise|société)\s*[:\-]\s*/i, '')
    .replace(/\s*[|–-]\s*(careers?|jobs?|job board|recruitment|talent)\s*$/i, '')
    .replace(/\s+(careers|jobs|recruitment|talent)$/i, '')
    .trim()
  return JOB_BOARD_NAMES.test(company) ? '' : company
}

function titleCase(value) {
  return String(value ?? '')
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((word) => word.slice(0, 1).toUpperCase() + word.slice(1))
    .join(' ')
}

function normalizeUrl(value) {
  const raw = String(value ?? '').trim()
  if (!raw) return ''
  try {
    return cleanJobUrl(new URL(raw).toString())
  } catch {
    return ''
  }
}

function decodeEntities(value) {
  return String(value ?? '')
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, num) => String.fromCodePoint(Number(num)))
    .replace(/&([a-z]+);/gi, (match, name) => ENTITY_MAP[name.toLowerCase()] ?? match)
}

function classText(html, className) {
  const pattern = new RegExp(`<([a-z0-9]+)[^>]*class=["'][^"']*${escapeRegExp(className)}[^"']*["'][^>]*>([\\s\\S]*?)<\\/\\1>`, 'i')
  const match = String(html ?? '').match(pattern)
  return match ? cleanHtml(match[2]) : ''
}

function tagText(html, tag) {
  const match = String(html ?? '').match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'))
  return match ? cleanHtml(match[1]) : ''
}

function textValue(value) {
  if (value == null) return ''
  if (typeof value === 'string') return cleanText(value)
  if (typeof value === 'number') return String(value)
  if (Array.isArray(value)) return value.map(textValue).filter(Boolean).join(', ')
  if (typeof value === 'object') return cleanText(value.name || value['@value'] || value.value || '')
  return ''
}

function asArray(value) {
  if (value == null) return []
  return Array.isArray(value) ? value : [value]
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
