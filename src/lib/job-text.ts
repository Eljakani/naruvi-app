/**
 * Turn job-description text of any shape into a small, safe document model:
 * headings, paragraphs and lists. Pure and deterministic; no HTML is trusted
 * or produced here (rendering happens in React, so nothing can inject markup).
 *
 * Handles: blank lines between bullets; bullets written with •, -, asterisks,
 * dashes, numbers or letters;
 * markdown (#, **bold**), ALL-CAPS and "Label:" headings, short title lines,
 * hard-wrapped paragraphs, whitespace-only lines and spacing artefacts like
 * "Dashlane , including".
 */

export type Block =
  | { type: "heading"; text: string; id: string }
  | { type: "paragraph"; text: string }
  | { type: "list"; ordered: boolean; items: string[] }

const BULLET = /^(?:[-*•·▪◦‣●○■□➤►▶✓✔–—]|\d{1,2}[.)]|[a-z][.)]|\(\d{1,2}\)|\(?[ivx]{1,4}\))\s+/i
const ORDERED = /^(?:\d{1,2}[.)]|\(\d{1,2}\))\s+/
const SENTENCE_END = /[.!?…:;)"”’]$/
const QUALIFICATIONS = /^(?:(?:minimum|preferred|required|basic|desired) )?qualifications$/i
const SECTION_BOUNDARY = /^(?:description|summary|responsibilities|requirements|benefits|how to apply|about (?:us|the company)|equal opportunity(?: employer)?|compensation|additional information)$/i

/**
 * Some sources hand us a posting flattened into one line ("### Missions: Build
 * … - Enhance … - Develop …"). Put headings, bullets and the sub-headings
 * stuck to the end of a bullet back on their own lines. Only used when the
 * text has almost no line breaks.
 */
export function unflatten(text: string): string {
  const breaks = (text.match(/\n/g) ?? []).length
  if (text.length < 400 || breaks > text.length / 350) return text
  const lines = text
    .replace(/\s+(#{1,6} )/g, "\n\n$1")
    .replace(/^(#{1,6} [^:\n]{1,80}:)[ \t]+/gm, "$1\n")
    .replace(/[ \t]+[-•*▪–][ \t]+(?=[A-ZÀ-Ý0-9"“(])/g, "\n- ")
    // Emoji often start a new line in flattened postings ("📍 Based in…", "👀 Interested?").
    .replace(/[ \t]+(?=\p{Extended_Pictographic})/gu, "\n")
    .split("\n")
  const out: string[] = []
  for (const line of lines) {
    // "- …implementation. Secure our applications and software supply chain" → bullet + sub-heading
    const stuck = line.match(/^(- .*?[.!?])\s+([A-ZÀ-Ý][^.!?:]{3,80})$/)
    if (stuck) out.push(stuck[1], "", stuck[2])
    else {
      // Paragraph text ending in a short title right before the first bullet.
      const lead = line.match(/^([^-#].*?[.!?])\s+([A-ZÀ-Ý][^.!?:]{3,80})$/)
      if (lead && !line.startsWith("- ")) out.push(lead[1], "", lead[2])
      else out.push(line)
    }
  }
  return out.join("\n")
}

export function normalizeText(raw: string): string {
  return unflatten(String(raw ?? ""))
    .replace(/\r\n?/g, "\n")
    .replace(/[   \t]/g, " ")
    .replace(/[​-‍﻿]/g, "")
    .split("\n")
    .map((line) =>
      line
        .replace(/ {2,}/g, " ")
        .replace(/ +([,.;:!?)])/g, "$1")
        // "customers.Founded" → "customers. Founded" (not domains or versions)
        .replace(/([a-zà-ÿ)]{2})([.!?])([A-ZÀ-Ý][a-zà-ÿ])/g, "$1$2 $3")
        .replace(/\( +/g, "(")
        .trim(),
    )
    .join("\n")
    // A bullet marker alone on its line belongs to the next line ("-\nText").
    .replace(/^([-*•·▪◦‣●○■□➤►▶✓✔–—]|\d{1,2}[.)])\n+(?=\S)/gm, "$1 ")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

function stripMarkdownHeading(line: string) {
  return line.replace(/^#{1,6}\s+/, "").replace(/^\*\*(.+)\*\*:?$/, "$1").replace(/^__(.+)__:?$/, "$1")
}

function isHeading(line: string, next: string | undefined): boolean {
  if (!line || BULLET.test(line)) return false
  if (/^#{1,6}\s+\S/.test(line)) return true
  if (/^(\*\*|__)[^*_]{2,80}(\*\*|__):?$/.test(line)) return true
  if (line.length > 80) return false
  const words = line.split(/\s+/).length
  const letters = line.replace(/[^A-Za-zÀ-ÿ]/g, "")
  if (letters.length >= 4 && letters === letters.toUpperCase() && words <= 8) return true
  if (/:$/.test(line) && words <= 10) return true
  // A short title-like line without sentence punctuation; a heading with no
  // content after it is demoted to a paragraph in a final pass.
  return words <= 7 && !SENTENCE_END.test(line) && /^[A-ZÀ-Ý0-9]/.test(line) && next !== undefined && !/^[a-zà-ÿ(]/.test(next)
}

function slug(text: string, used: Set<string>) {
  const base =
    text
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 48) || "section"
  let id = base
  for (let i = 2; used.has(id); i += 1) id = `${base}-${i}`
  used.add(id)
  return id
}

export function parseJobText(raw: string): Block[] {
  const lines = normalizeText(raw).split("\n")
  const blocks: Block[] = []
  const used = new Set<string>()
  let paragraph: string[] = []
  let list: { ordered: boolean; items: string[] } | null = null
  let inQualifications = false

  const flushParagraph = () => {
    if (paragraph.length) blocks.push({ type: "paragraph", text: paragraph.join(" ") })
    paragraph = []
  }
  const flushList = () => {
    if (list?.items.length) blocks.push({ type: "list", ...list })
    list = null
  }
  const nextNonEmpty = (from: number) => {
    for (let j = from; j < lines.length; j += 1) if (lines[j]) return lines[j]
    return undefined
  }

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]
    if (!line) {
      // Blank lines end paragraphs but not lists: many sources put a blank
      // line between every bullet.
      flushParagraph()
      if (list && !BULLET.test(nextNonEmpty(i + 1) ?? "")) flushList()
      continue
    }
    if (BULLET.test(line)) {
      flushParagraph()
      const ordered = ORDERED.test(line)
      if (!list || list.ordered !== ordered) {
        flushList()
        list = { ordered, items: [] }
      }
      list.items.push(line.replace(BULLET, "").trim())
      continue
    }
    if (list && lines[i - 1] && /^[a-zà-ÿ(]/.test(line)) {
      // Hard-wrapped continuation of the previous bullet.
      list.items[list.items.length - 1] += ` ${line}`
      continue
    }
    const text = stripMarkdownHeading(line).replace(/:$/, "").trim()
    const qualificationHeading = QUALIFICATIONS.test(text)
    // Some job boards flatten qualification lists to one unmarked item per line.
    // A prose footer or another section ends that format.
    if (inQualifications && /[.!?]\s+["“]?[A-ZÀ-Ý][a-zà-ÿ]+\s/.test(line)) {
      inQualifications = false
      flushList()
    }
    const next = lines[i + 1]
    if (qualificationHeading || SECTION_BOUNDARY.test(text) || (!inQualifications && isHeading(line, next)) || (inQualifications && /^(?:#{1,6}\s|\*\*|__)/.test(line) && isHeading(line, next))) {
      flushParagraph()
      flushList()
      blocks.push({ type: "heading", text, id: slug(text, used) })
      inQualifications = qualificationHeading
      continue
    }
    if (inQualifications) {
      flushParagraph()
      list ??= { ordered: false, items: [] }
      list.items.push(line)
      continue
    }
    flushList()
    // Join hard-wrapped lines; start a new paragraph after a finished sentence
    // followed by a capitalised line.
    const previous = paragraph.at(-1)
    if (previous && SENTENCE_END.test(previous) && /^[A-ZÀ-Ý"“]/.test(line)) flushParagraph()
    paragraph.push(line)
  }
  flushParagraph()
  flushList()

  // A "heading" with nothing after it is just a short line of text.
  return blocks.map((block, index) => (block.type === "heading" && (index === blocks.length - 1 || blocks[index + 1].type === "heading") ? { type: "paragraph", text: block.text } : block))
}

export type InlinePart = { type: "text" | "bold" | "link" | "email"; value: string }

/** Split text into plain, **bold**, URL and e-mail parts (rendered by React). */
export function inlineParts(text: string): InlinePart[] {
  const parts: InlinePart[] = []
  const pattern = /(\*\*[^*]+\*\*)|(https?:\/\/[^\s<>()]+[^\s<>().,;:!?'"”’])|([\w.+-]+@[\w-]+(?:\.[\w-]+)+)/g
  let last = 0
  for (const match of text.matchAll(pattern)) {
    const index = match.index ?? 0
    if (index > last) parts.push({ type: "text", value: text.slice(last, index) })
    if (match[1]) parts.push({ type: "bold", value: match[1].slice(2, -2) })
    else if (match[2]) parts.push({ type: "link", value: match[2] })
    else if (match[3]) parts.push({ type: "email", value: match[3] })
    last = index + match[0].length
  }
  if (last < text.length) parts.push({ type: "text", value: text.slice(last) })
  return parts
}

/** "Mentoring: You enjoy…" → { label: "Mentoring", rest: "You enjoy…" } for short leading labels. */
export function leadLabel(item: string): { label: string; rest: string } | null {
  const match = item.match(/^([^:.!?]{2,48}?)\s*(?::|\s[–—-])\s+(\S.*)$/)
  if (!match) return null
  const label = match[1].trim()
  if (label.split(/\s+/).length > 6 || /https?:/.test(label)) return null
  return { label, rest: match[2] }
}
