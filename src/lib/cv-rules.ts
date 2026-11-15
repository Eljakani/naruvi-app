/**
 * Reads a CV without a language model: sections by their titles, entries by
 * their dates and bullets, fields by position and by tell-tale words. Pure.
 * It is the fallback when no model is connected. It copies, never completes;
 * what it can't place is reported as unread, and everything it returns is for
 * the person to check.
 */
import { groundIdentity, linkKey, phonesIn, profileSite, sourceLinks, unreadLines, type Identity, type SourceLink } from "@/lib/cv-ground"
import { splitSections, type CvSection, type SectionKind } from "@/lib/cv-sections"
import { parseDateRange } from "@/lib/date-range"
import { fromMonthYear, fromRange, looseFields, type EntryFields, type EntryKind } from "@/lib/entry-fields"
import { readLanguageLevel, splitLanguageItem } from "@/lib/language-level"

export type RuleEntry = { kind: EntryKind; text: Record<string, string>; fields: EntryFields; facts: string[]; skills: string[]; bullets: { text: string; facts: number[] }[]; dropped: number; unnamed?: boolean }
export type RuleImport = { language: string; identity: Identity; entries: RuleEntry[]; unread: string[] }

const fold = (value: string) => value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
const BULLET = /^\s*(?:[•◦▪●*–—→>-])\s+/
const isBullet = (line: string) => BULLET.test(line)
const unbullet = (line: string) => line.replace(BULLET, "").trim()
const EMAIL = /[\p{L}\p{N}._%+-]+@[\p{L}\p{N}.-]+\.\p{L}{2,}/u
const URL = /\b(?:https?:\/\/|www\.)[^\s<>"'()]+|\b(?:[a-z0-9-]+\.)+(?:com|org|net|io|dev|me|co|fr|de|es|it|uk|ma|se)\/[^\s<>"'()]+/i

/* ------------------------------------------------------------------ language of the text */

const STOPWORDS: Record<string, string[]> = {
  en: ["the", "and", "with", "for", "of", "to", "in"], fr: ["le", "la", "les", "et", "des", "avec", "pour", "du", "en"], es: ["el", "los", "las", "con", "para", "del", "una"],
  de: ["der", "die", "und", "mit", "für", "das", "von", "bei"], it: ["il", "gli", "con", "per", "della", "di", "nel"], pt: ["os", "com", "para", "do", "da", "em", "uma"], nl: ["de", "het", "en", "met", "voor", "van", "een"],
}
export function textLanguage(text: string): string {
  const letters = text.match(/\p{L}/gu)?.length ?? 0
  if ((text.match(/[؀-ۿ]/g)?.length ?? 0) > letters * 0.3) return "ar"
  // Addresses are not words: "example.de" says nothing about the language.
  const tokens = text.toLowerCase().replace(/\S+@\S+|\b\S+\.[a-z]{2,}(?:\/\S*)?/g, " ").split(/[^\p{L}]+/u)
  const scores = Object.entries(STOPWORDS).map(([lang, list]) => [lang, tokens.filter((token) => list.includes(token)).length] as const).sort((a, b) => b[1] - a[1])
  return scores[0][1] > 2 || (scores[0][1] > 0 && scores[0][1] > scores[1][1]) ? scores[0][0] : "en"
}

/* ------------------------------------------------------------------ dates inside a line */

const MONTH = "(?:[\\p{L}]{3,12}\\.?\\s+(?:de\\s+|of\\s+)?)?"
const POINT = `(?:${MONTH}(?:19|20)\\d{2}(?:-(?:0[1-9]|1[0-2]))?|(?:0?[1-9]|1[0-2])[/.](?:19|20)\\d{2})`
const NOW = "(?:present|now|today|current|ongoing|aujourd[’']hui|ce jour|en cours|actuel(?:lement)?|actualidad|presente|hoy|heute|jetzt|oggi|heden|حتى الآن|الآن|الحاضر)"
const SPAN = new RegExp(`(?:(?:since|depuis|seit|desde|dal|sinds|منذ)\\s+${POINT}|${POINT}\\s*(?:[-–—→>]+|[^\\p{L}\\p{N}\\s]{1,2}(?=\\s)|to|à|au|bis|hasta|al?|إلى)\\s*(?:${POINT}|${NOW})|${POINT})`, "iu")

/** The first date or date span a line states, with the text around it. */
export function dateIn(line: string): { written: string; before: string; after: string } | null {
  const match = line.match(SPAN)
  if (!match || match.index === undefined) return null
  let written = match[0]
  // A leading word that is not a month ("Leeds 2014 – 2018") belongs to the text before.
  const lead = written.match(/^([\p{L}]{3,12}\.?)\s+(?:de\s+|of\s+)?(?=(?:19|20)\d{2})/u)
  if (lead && parseDateRange(`${lead[1]} 2000`)?.start?.month == null && !/^(?:since|depuis|seit|desde|dal|sinds|منذ)$/iu.test(lead[1])) written = written.slice(lead[0].length)
  const start = line.indexOf(written, match.index)
  // A season before the year ("été 2024") is part of the date, not of the title.
  const before = line.slice(0, start).replace(/(?:^|\s)(?:[ée]t[ée]|hiver|printemps|automne|summer|winter|spring|fall|autumn|sommer|fr[üu]hling|herbst|verano|invierno|primavera|oto[ñn]o)\s*$/iu, " ")
  return parseDateRange(written)?.start ? { written, before, after: line.slice(start + written.length) } : null
}

/* ------------------------------------------------------------------ blocks: one per entry */

type Block = { head: string[]; bullets: string[]; written: string }

/** Cuts a section into entries. A date starts an entry when the section puts dates first, and closes its title lines otherwise. */
function blocks(lines: string[]): Block[] {
  const filled = lines.filter((line) => line.trim())
  const firstHead = filled.find((line) => !isBullet(line)) ?? ""
  const first = dateIn(firstHead)
  const dateFirst = Boolean(first && !first.before.replace(/[\s(|–—-]+/g, ""))
  const dated = filled.some((line) => !isBullet(line) && dateIn(line))
  const out: Block[] = []
  let current = null as Block | null
  let gap = false
  const open = () => {
    current = { head: [], bullets: [], written: "" }
    out.push(current)
    return current
  }
  for (const line of lines) {
    if (!line.trim()) {
      gap = true
      continue
    }
    if (isBullet(line)) {
      ;(current ?? open()).bullets.push(unbullet(line))
      gap = false
      continue
    }
    // A wrapped bullet: the line goes on in lower case, or the bullet had not ended its sentence.
    const last = current?.bullets.at(-1)
    if (last && !gap && !dateIn(line) && (/^[\p{Ll}\d(%]/u.test(line.trim()) || (!/[.!?;:]$/.test(last) && line.trim().split(/\s+/).length <= 4 && /[.!?]$/.test(line.trim())))) {
      current!.bullets[current!.bullets.length - 1] = `${last} ${line.trim()}`
      continue
    }
    const date = dateIn(line)
    // A title line that wrapped: it goes on in lower case.
    if (current && !gap && !date && !current.bullets.length && current.head.length && /^\p{Ll}/u.test(line.trim()) && !URL.test(line)) {
      current.head[current.head.length - 1] += ` ${line.trim()}`
      continue
    }
    // In a list with no dates at all (projects, awards), every line is an item; a bare address belongs to the item above it.
    if (!dated && current && !gap && URL.test(line) && line.replace(URL, "").trim().length < 4) {
      current.head.push(line.trim())
      continue
    }
    const block: Block | null = current
    const startsNew = !block || !dated || (dateFirst ? Boolean(date) : block.bullets.length > 0 || (Boolean(block.written) && (gap || Boolean(date) || line.trim().split(/\s+/).length <= 12) && !(date && !block.written)))
    const target = startsNew ? open() : block!
    if (date && !target.written) {
      target.written = date.written
      const rest = `${date.before} ${date.after}`.replace(/\(\s*\)/g, " ").replace(/^[\s,;:|–—·-]+|[\s,;:|–—·(-]+$/g, "").trim()
      if (rest) target.head.push(rest)
    } else target.head.push(line.trim())
    gap = false
  }
  // A title with no date and no bullets, right before dated entries, names what follows (an employer with several roles).
  const merged: Block[] = []
  for (let index = 0; index < out.length; index += 1) {
    const block = out[index]
    const next = out[index + 1]
    if (!block.written && !block.bullets.length && block.head.length === 1 && next?.written && !dateFirst) {
      let follower = index + 1
      while (follower < out.length && out[follower].written && (follower === index + 1 || out[follower].head.length <= 1)) {
        out[follower].head.push(block.head[0])
        follower += 1
      }
      continue
    }
    // A stray line after an entry (honours, a grade) is a detail of that entry.
    if (!block.written && !block.bullets.length && merged.length && merged.at(-1)!.written) merged.at(-1)!.bullets.push(...block.head)
    else merged.push(block)
  }
  return merged
}

const SEPARATOR = /\s+[–—|·•]\s+|\s+-\s+|\s{3,}|\s*\|\s*|\s+(?:at|chez|bei|@)\s+|,\s+(?=\p{Lu})/u
/** The pieces of a title line: "Backend Engineer — Deliveroo, London" → three pieces. */
function pieces(head: string[]): string[] {
  return head.flatMap((line) => {
    const inner = [...line.matchAll(/\(([^)]+)\)/g)].map((match) => match[1])
    return [...line.replace(/\([^)]*\)/g, " ").split(SEPARATOR), ...inner]
  }).map((piece) => piece.replace(/^[\s,;:.–—-]+|[\s,;:–—-]+$/g, "").trim()).filter(Boolean)
}

const ORG = /\b(?:ltd|inc|llc|gmbh|ag|se|sa|sas|sarl|plc|corp|group|groupe|cabinet|company|bank|banque|agency|agence|studio|labs?|consulting|hospital|h[oô]pital|clinic|minist|council|mairie|association|foundation|fondation|ong|ngo)\b/i
const SCHOOL = /universit|school|[ée]cole|institut|college|coll[èe]ge|lyc[ée]e|hochschule|akademie|academy|polytech|facult|gymnasium|conservatoire|\b(?:rwth|eth|epfl|mit|ens|insa|iut|iit|tu|uni)\b|جامعة|مدرسة|معهد|كلية/i
const DEGREE = /\b(?:bsc|b\.sc|msc|m\.sc|ba|ma|mba|phd|ph\.d|btech|mtech|bachelor|master|licence|license|licenciatura|grado|m[aá]ster|doctorat|doctorate|dipl[oô]me?|diplom|bac|baccalaur[ée]at|abitur|bts|dut|but|deug|degree|ing[ée]nieur|laurea|magister|staatsexamen|ausbildung|certificat|hnd|a-levels?)\b|دبلوم|إجازة|ماجستير|بكالوريوس|دكتوراه|ماستر/i
const ROLE = /engineer|developer|d[ée]veloppeu|manager|designer|analyst|consultant|intern\b|stagiaire|assistant|director|directeur|chef|lead\b|head\b|officer|specialist|architect|scientist|researcher|teacher|nurse|ingenieur|ing[ée]nieur|entwickler|leiter|berater|konstrukteur|dise[ñn]ador|desarrollador|ingenier|responsable|charg[ée]|technicien|vendeu|comptable|juriste|avocat|مهندس|مطور|مدير/i
const EMPLOYMENT: [RegExp, string][] = [[/freelance|ind[ée]pendant|self-employed/i, "freelance"], [/altern|apprenti/i, "apprenticeship"], [/\b(?:stage|stagiaire|intern|internship|praktikum|praktikant\w*|pr[aá]cticas|becari[oa])\b/i, "internship"], [/\b(?:cdd|fixed[- ]term)\b/i, "fixed_term"], [/\b(?:part[- ]time|temps partiel|teilzeit)\b/i, "part_time"], [/\b(?:volunteer|b[ée]n[ée]vol\w*|ehrenamt\w*|voluntari[oa])\b/i, "volunteer"]]
const WORK_MODE: [RegExp, string][] = [[/\b(?:remote|t[ée]l[ée]travail|homeoffice|home office|remoto)\b/i, "remote"], [/\b(?:hybrid|hybride|h[ií]brido)\b/i, "hybrid"]]

const dates = (written: string) => {
  const range = written ? parseDateRange(written) : null
  return range?.start ? fromRange(range) : undefined
}
const month = (written: string) => fromMonthYear(written ? parseDateRange(written)?.start ?? null : null)
const entry = (kind: EntryKind, text: Record<string, string | undefined>, fields: Record<string, unknown>, facts: string[] = [], skills: string[] = []): RuleEntry => {
  const kept = [...new Set(facts.map((fact) => fact.trim().slice(0, 600)).filter((fact) => fact.length >= 3))].slice(0, 40)
  return {
    kind, text: Object.fromEntries(Object.entries(text).filter((pair): pair is [string, string] => Boolean(pair[1]?.trim())).map(([key, value]) => [key, value.trim().slice(0, 200)])),
    fields: looseFields(kind, fields), facts: kept, skills: [...new Set(skills)].slice(0, 80), bullets: kept.map((fact, index) => ({ text: fact, facts: [index] })), dropped: 0,
  }
}

function work(block: Block, kind: "experience" | "other"): RuleEntry {
  const all = block.head.join(" ")
  // "(stage)" and "Remote" are the contract and the work mode, not a place or an employer; "Research Intern" is a job title.
  const only = (part: string, list: [RegExp, string][]) => list.some(([pattern]) => !part.replace(new RegExp(pattern.source, "gi"), "").replace(/[\s\-()]/g, ""))
  const named = pieces(block.head).filter((part) => !only(part, WORK_MODE) && !EMAIL.test(part))
  // "Intern" alone is the job's title when nothing else names it.
  const parts = named.some((part) => !only(part, EMPLOYMENT)) && named.findIndex((part) => !only(part, EMPLOYMENT)) === 0 ? named.filter((part) => !only(part, EMPLOYMENT)) : named.filter((part, index) => index === 0 || !only(part, EMPLOYMENT))
  // The employer comes first on some CVs: a piece that reads like an organisation, before one that reads like a job.
  const role = parts.findIndex((part) => ROLE.test(part) && !ORG.test(part))
  const position = parts[role >= 0 ? role : 0] ?? ""
  const rest = parts.filter((_, index) => index !== (role >= 0 ? role : 0))
  const company = rest[0] ?? ""
  const location = rest.slice(1).find((part) => part.split(/\s+/).length <= 4 && !/\d/.test(part)) ?? ""
  const fields = { company, dates: dates(block.written), employment: EMPLOYMENT.find(([pattern]) => pattern.test(all))?.[1], workMode: WORK_MODE.find(([pattern]) => pattern.test(all))?.[1] }
  if (kind === "other") return entry("other", { title: position, subtitle: company }, { dates: fields.dates }, block.bullets)
  return entry("experience", { position, location }, fields, block.bullets)
}

function study(block: Block): RuleEntry {
  const parts = pieces(block.head)
  const school = parts.find((part) => SCHOOL.test(part)) ?? parts[1] ?? ""
  const degree = parts.find((part) => part !== school && DEGREE.test(part)) ?? parts.find((part) => part !== school) ?? ""
  const others = parts.filter((part) => part !== school && part !== degree)
  const location = others.find((part) => part.split(/\s+/).length <= 3 && !/\d/.test(part) && /^\p{Lu}/u.test(part) && !/mention|honou?rs|grade|note|cum laude/i.test(part)) ?? ""
  return entry("education", { degree, location }, { school, dates: dates(block.written) }, [...others.filter((part) => part !== location), ...block.bullets])
}

function certificate(block: Block, urls: string[]): RuleEntry {
  const all = [...block.head, ...block.bullets].join(" ")
  const credential = all.match(/(?:credential|licen[cs]e|certificate|certificat)?\s*(?:id|n[°o]\.?|number|#)\s*[:#]?\s*([A-Z0-9][A-Z0-9-]{4,})/i)?.[1]
  const parts = pieces(block.head.map((line) => line.replace(/(?:issued|d[ée]livr[ée]e?|obtenue?|expedido|ausgestellt)\s*:?\s*$/i, "").replace(/credential id.*$/i, "")))
  const url = urls.filter((item) => all.toLowerCase().includes(linkKey(item))).sort((a, b) => b.length - a.length)[0]
  return entry("certification", {}, { name: parts[0] ?? "", issuer: parts[1] ?? "", issued: month(block.written), credentialId: credential, url }, block.bullets)
}

function project(block: Block, urls: string[]): RuleEntry {
  const all = [...block.head, ...block.bullets].join(" ")
  // The longest address first: "github.com/me/project" before the profile "github.com/me" it starts with.
  const found = urls.filter((item) => all.toLowerCase().includes(linkKey(item))).sort((a, b) => b.length - a.length)
  const repo = found.find((item) => /github\.com|gitlab\.com|bitbucket\.org/i.test(item))
  const parts = pieces(block.head.map((line) => line.replace(URL, " "))).filter((part) => part.length > 1)
  return entry("project", { tagline: parts.slice(1).join(" — ") }, { name: parts[0] ?? "", repo, url: found.find((item) => item !== repo), dates: dates(block.written) }, block.bullets.filter((line) => !URL.test(line) || line.replace(URL, "").trim().length > 8))
}

const EVENT_ROLE: [RegExp, string][] = [[/\b(?:speaker|ponente|intervenante?|conf[ée]renci\w+|referent(?:in)?|keynote|talk)\b/i, "speaker"], [/\bpanel\w*/i, "panelist"], [/\b(?:organi[sz]er|organisat\w+|organizador\w*)\b/i, "organizer"], [/\b(?:attendee|participante?|teilnehmer\w*|asistente)\b/i, "attendee"]]
function occasion(line: string): RuleEntry {
  const date = dateIn(line)
  const quoted = line.match(/[«“"„]\s*([^»”"]{4,})\s*[»”"]/)?.[1]?.trim()
  const role = EVENT_ROLE.find(([pattern]) => pattern.test(line))?.[1]
  const bare = line.replace(/[«“"„][^»”"]{4,}[»”"]/, " ").replace(/\((?:speaker|attendee|panelist|organi[sz]er)\)/gi, " ")
  const parts = pieces([bare.replace(/\b(?:speaker|ponente|intervenante?|attendee|participante?)\b\s*(?:at|en|à|bei|:)?/gi, " ")]).filter((part) => part.length > 2)
  // The event keeps its year ("PyData Berlin 2023") as written; the date field reads it.
  const named = parts.find((part) => /(?:19|20)\d{2}/.test(part) && /\p{L}{3}/u.test(part.replace(/\b\p{L}+\.?\s+(?:de\s+)?(?:19|20)\d{2}/u, ""))) ?? parts[0] ?? ""
  const event = named.replace(/^(?:en|at|à|in|bei)\s+/i, "").replace(/:$/, "").trim()
  const location = parts.find((part) => part !== named && !/\d/.test(part) && part.split(/\s+/).length <= 3 && /^\p{Lu}/u.test(part)) ?? ""
  return entry("event", { title: quoted ?? event, location }, { event, role, date: month(date?.written ?? "") }, [])
}

const listItems = (text: string) => text.split(/[,;•·|،]|\s{3,}/).map((item) => item.trim().replace(/[.]$/, "")).filter((item) => item.length >= 1 && item.length <= 60)

function skillGroups(section: CvSection): RuleEntry[] {
  const out: RuleEntry[] = []
  let label = ""
  const loose: string[] = []
  for (const raw of section.lines) {
    const line = unbullet(raw).trim()
    if (!line) continue
    const named = line.match(/^([^:,;]{2,40}?)(?:\s*:\s+|\s{3,})(.+)$/)
    if (named) out.push(entry("skill", { name: named[1].trim() }, {}, [], listItems(named[2])))
    else if (!/[,;،]/.test(line) && line.split(/\s+/).length <= 4 && !label) label = line
    else if (label) {
      out.push(entry("skill", { name: label }, {}, [], listItems(line)))
      label = ""
    } else loose.push(...listItems(line))
  }
  if (label) loose.push(label)
  if (loose.length) out.push(entry("skill", { name: section.title }, {}, [], loose))
  return out
}

function spoken(section: CvSection): RuleEntry[] {
  const items = section.lines.flatMap((line) => {
    const text = unbullet(line).trim()
    // "Deutsch   Muttersprache" and "English — Fluent" are one language each; a comma list holds several.
    return /\s{3,}|\s[–—-]\s|:/.test(text) && !/[,;·،]/.test(text.replace(/\([^)]*\)/g, "")) ? [text] : text.split(/[,;·•|،](?![^()]*\))/)
  }).map((item) => item.trim()).filter(Boolean)
  return items.flatMap((item) => {
    const { name, rest } = splitLanguageItem(item)
    if (!name || name.split(/\s+/).length > 3 || /\d/.test(name)) return []
    return [entry("language", { language: name }, readLanguageLevel(rest))]
  })
}

/* ------------------------------------------------------------------ identity */

const LABELLED = /^(name|nom|nombre|الاسم|anschrift|adresse|address|direcci[oó]n|e-?mail|courriel|telefon|t[ée]l[ée]phone|phone|tel|mobile|الهاتف)\s*(?::|\s{3,})\s*(.+)$/i
function identityOf(header: string[], contact: string[], summary: string, text: string, links: SourceLink[]): Identity {
  const lines = [...header, ...contact].map((line) => line.trim()).filter(Boolean)
  const labelled = new Map<string, string>()
  for (const line of lines) {
    const match = line.match(LABELLED)
    if (match) labelled.set(fold(match[1]).replace(/[^a-z؀-ۿ]/g, "").slice(0, 4), match[2].trim())
  }
  const plain = lines.filter((line) => !LABELLED.test(line))
  const bare = (line: string) => !EMAIL.test(line) && !URL.test(line) && !phonesIn(line).length && !/\d{3}/.test(line)
  const name = labelled.get("name") ?? labelled.get("nom") ?? labelled.get("nomb") ?? plain.find((line) => bare(line) && line.split(/\s+/).length >= 2 && line.split(/\s+/).length <= 5 && !/[|·–—,:]/.test(line)) ?? ""
  const after = plain.slice(plain.indexOf(name) + 1)
  const segments = after.slice(0, 5).flatMap((line) => line.split(/\s+[–—|·]\s+|\s*\|\s*|\s{3,}/)).map((part) => part.trim()).filter((part) => part && bare(part))
  const place = (part: string) => /^[\p{L} .'’-]+,\s*[\p{L} .'’-]+$/u.test(part) && part.split(/\s+/).length <= 5
  const address = labelled.get("ansc") ?? labelled.get("adre") ?? labelled.get("addr") ?? labelled.get("dire") ?? ""
  const headline = segments.find((part) => !place(part) && part.split(/\s+/).length <= 10) ?? ""
  const location = segments.find(place) ?? address.split(",").at(-1)?.replace(/\b\d{4,6}\b/g, "").trim() ?? segments.find((part) => part !== headline && part.split(/\s+/).length <= 3) ?? ""
  return groundIdentity({ fullName: name, headline, summary, email: text.match(EMAIL)?.[0] ?? "", phone: phonesIn(lines.join("\n"))[0] ?? "", location, links: [] }, text, links)
}

/* ------------------------------------------------------------------ whole CV */

const BLOCK_KINDS: Partial<Record<SectionKind, (block: Block, urls: string[]) => RuleEntry>> = {
  experience: (block) => work(block, "experience"), volunteer: (block) => work(block, "other"), education: (block) => study(block), certification: certificate, project,
}

export function readCvWithRules(text: string, links: SourceLink[] = []): RuleImport {
  const { header, sections } = splitSections(text)
  const urls = sourceLinks(text, links)
  const entries: RuleEntry[] = []
  for (const section of sections) {
    const build = BLOCK_KINDS[section.kind]
    if (build) {
      const made = blocks(section.lines).map((block) => build(block, urls))
      // Several jobs under one employer: a job given by its title alone is at the employer named just above.
      made.forEach((item, index) => {
        const before = made[index - 1]
        if (item.kind !== "experience" || !before || item.fields.company) return
        if (before.fields.company) item.fields.company = before.fields.company
        if (!item.text.location && before.text.location) item.text.location = before.text.location
      })
      entries.push(...made)
    }
    else if (section.kind === "skill") entries.push(...skillGroups(section))
    else if (section.kind === "language") entries.push(...spoken(section))
    else if (section.kind === "event") entries.push(...section.lines.filter((line) => line.trim()).map((line) => occasion(unbullet(line))))
    else if (section.kind === "achievement" || section.kind === "publication") {
      for (const line of section.lines.filter((item) => item.trim())) {
        const date = dateIn(line)
        const parts = pieces([date ? `${date.before} ${date.after}` : unbullet(line)])
        entries.push(entry("achievement", { title: parts[0] ?? "" }, { issuer: parts[1] ?? "", date: month(date?.written ?? "") }, []))
      }
    } else if (section.kind === "interest" || section.kind === "other") {
      // A list under a title this module has no word for ("What I do best") is still a list of skills.
      const labelled = section.lines.filter((line) => /^[^:]{2,40}:\s+\S/.test(unbullet(line))).length
      if (section.kind === "other" && labelled >= 1 && labelled >= section.lines.filter((line) => line.trim()).length / 2) entries.push(...skillGroups(section))
      else if (section.lines.some((line) => line.trim())) entries.push(entry("other", { title: section.title, subtitle: section.lines.map((line) => unbullet(line)).filter(Boolean).join(" · ") }, {}, section.lines.map((line) => unbullet(line)).filter((line) => line.length > 60)))
    }
  }
  for (const item of entries) {
    const required = { experience: item.text.position, education: item.text.degree, project: item.fields.name, certification: item.fields.name, skill: item.text.name, language: item.text.language, achievement: item.text.title, event: item.text.title, other: item.text.title }[item.kind]
    if (!required) item.unnamed = true
  }
  const kept = entries.filter((item) => item.facts.length || item.skills.length || Object.keys(item.text).length || Object.keys(item.fields).length).slice(0, 120)
  const summary = sections.filter((section) => section.kind === "summary").flatMap((section) => section.lines).map((line) => line.trim()).filter(Boolean).join(" ").slice(0, 1200)
  const contact = sections.filter((section) => section.kind === "contact").flatMap((section) => section.lines)
  const identity = identityOf(header, contact, summary, text, links)
  // Profile links are the person's, not a project's.
  for (const item of kept) for (const key of ["url", "repo"] as const) if (typeof item.fields[key] === "string" && profileSite(item.fields[key] as string) && identity.links.some((link) => linkKey(link.url) === linkKey(item.fields[key] as string))) delete item.fields[key]
  // Language lines become a name and a level: their own words count as read.
  // So do dates, contract types and work modes, which are stored as values.
  const values = sections.flatMap((section) => section.lines).flatMap((line) => [dateIn(line)?.written ?? "", line.match(/(?:^|\s)([ée]t[ée]|hiver|printemps|automne|summer|winter|spring|fall|autumn)\s+(?:19|20)\d{2}/iu)?.[1] ?? "", ...[...EMPLOYMENT, ...WORK_MODE].map(([pattern]) => line.match(pattern)?.[0] ?? "")]).filter(Boolean)
  const consumed = [...values, ...sections.filter((section) => section.kind === "language").flatMap((section) => section.lines)]
  return { language: textLanguage(text), identity, entries: kept, unread: unreadLines(text, identity, kept, consumed) }
}
