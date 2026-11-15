/**
 * Text of a Word (.docx) or OpenDocument (.odt) file, from its XML parts.
 * Pure: XML strings in, lines and links out. Paragraphs become lines, table
 * rows keep their cells together (a date column stays next to its job), text
 * boxes and headers are read, and the address behind a linked word is kept.
 */

export type OfficeLink = { text: string; url: string }
export type OfficeText = { lines: string[]; links: OfficeLink[] }

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" }
const decode = (text: string) =>
  text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, code: string) => {
    if (code[0] === "#") {
      const point = code[1].toLowerCase() === "x" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10)
      return Number.isFinite(point) && point > 0 && point <= 0x10ffff ? String.fromCodePoint(point) : ""
    }
    return ENTITIES[code.toLowerCase()] ?? match
  })
const attribute = (attributes: string, name: string) => {
  const match = attributes.match(new RegExp(`(?:^|\\s)${name}\\s*=\\s*"([^"]*)"`))
  return match ? decode(match[1]) : null
}

type Token = { close: boolean; self: boolean; name: string; attributes: string } | { text: string }
function* tokens(xml: string): Generator<Token> {
  const pattern = /<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<(\/?)([A-Za-z_][\w:.-]*)((?:"[^"]*"|'[^']*'|[^>"'])*?)(\/?)>|([^<]+)/g
  for (const match of xml.matchAll(pattern)) {
    if (match[2]) yield { close: match[1] === "/", self: match[4] === "/", name: match[2], attributes: match[3] ?? "" }
    else if (match[5] !== undefined) yield { text: match[5] }
  }
}

/** A table cell's lines, or a nested table's rows already flattened. */
type Cell = string[]
type Frame = { rows: Cell[][]; row: Cell[] | null; cell: Cell | null }

/** One table row as lines: cells side by side when they are short, one after the other when several hold a column of text. */
function rowLines(cells: Cell[]): string[] {
  const filled = cells.map((cell) => cell.filter((line) => line.trim())).filter((cell) => cell.length)
  if (!filled.length) return []
  const long = filled.filter((cell) => cell.length > 1).length
  // A page laid out as a two-cell table: each cell is a column of the page.
  if (long > 1) return filled.flatMap((cell, index) => (index ? ["", ...cell] : cell))
  const first = filled.map((cell) => cell[0]).join("   ")
  const rest = filled.find((cell) => cell.length > 1)?.slice(1) ?? []
  return [first, ...rest]
}

type Dialect = {
  paragraph: Set<string>; text: Set<string>; tab: Set<string>; lineBreak: Set<string>
  table: string; row: string; cell: string
  /** Subtrees that repeat or hide content. */
  skip: Set<string>
}
const WORD: Dialect = {
  paragraph: new Set(["w:p"]), text: new Set(["w:t"]), tab: new Set(["w:tab"]), lineBreak: new Set(["w:br", "w:cr"]),
  table: "w:tbl", row: "w:tr", cell: "w:tc",
  // mc:Fallback repeats a text box as a picture's alternative; deleted text is a tracked change.
  skip: new Set(["mc:Fallback", "w:del", "w:moveFrom", "w:instrText"]),
}
const OPEN_DOCUMENT: Dialect = {
  paragraph: new Set(["text:p", "text:h"]), text: new Set(), tab: new Set(["text:tab"]), lineBreak: new Set(["text:line-break"]),
  table: "table:table", row: "table:table-row", cell: "table:table-cell",
  skip: new Set(["text:tracked-changes", "office:annotation", "text:note"]),
}

function read(xml: string, dialect: Dialect, relations: Map<string, string>): OfficeText {
  const lines: string[] = []
  const links: OfficeLink[] = []
  const frames: Frame[] = []
  /** Open paragraphs: a text box sits inside the paragraph that anchors it. */
  const paragraphs: { text: string; bullet: boolean; heading: boolean }[] = []
  let skipDepth = 0
  let skipName = ""
  let inText = 0
  let link: { url: string; text: string } | null = null
  const openDocument = dialect === OPEN_DOCUMENT
  const emit = (line: string, heading = false) => {
    const frame = frames.at(-1)
    if (frame?.cell) frame.cell.push(line)
    else {
      if (heading && lines.length && lines.at(-1) !== "") lines.push("")
      lines.push(line)
    }
  }
  const append = (text: string) => {
    const paragraph = paragraphs.at(-1)
    if (paragraph) paragraph.text += text
    if (link) link.text += text
  }
  for (const token of tokens(xml)) {
    if ("text" in token) {
      if (!skipDepth && (inText > 0 || (openDocument && paragraphs.length))) append(decode(token.text))
      continue
    }
    const { name, close, self, attributes } = token
    if (skipDepth) {
      if (name === skipName && !self) skipDepth += close ? -1 : 1
      continue
    }
    if (dialect.skip.has(name)) {
      if (!close && !self) {
        skipDepth = 1
        skipName = name
      }
      continue
    }
    if (dialect.paragraph.has(name)) {
      if (self) emit("")
      else if (!close) paragraphs.push({ text: "", bullet: false, heading: name === "text:h" })
      else {
        const paragraph = paragraphs.pop()
        if (paragraph) {
          const parts = paragraph.text.split("\n").map((part) => part.replace(/[ \t]+/g, (space) => (space.includes("\t") ? "   " : " ")).trim())
          parts.forEach((part, index) => emit(index === 0 && paragraph.bullet && part ? `• ${part}` : part, paragraph.heading && index === 0))
        }
      }
    } else if (dialect.text.has(name)) inText += self ? 0 : close ? -1 : 1
    else if (dialect.tab.has(name)) append("\t")
    else if (dialect.lineBreak.has(name)) append("\n")
    else if (name === "w:numPr" || name === "text:list-item") {
      const paragraph = paragraphs.at(-1)
      if (paragraph && name === "w:numPr") paragraph.bullet = true
    } else if (name === "w:pStyle") {
      const paragraph = paragraphs.at(-1)
      if (paragraph && /^(heading|titre|title|[uü]berschrift|t[ií]tulo)/i.test(attribute(attributes, "w:val") ?? "")) paragraph.heading = true
    } else if (name === "w:hyperlink" || name === "text:a") {
      if (close) {
        if (link && /^(https?:|mailto:)/i.test(link.url)) links.push({ text: link.text.replace(/\s+/g, " ").trim().slice(0, 80), url: link.url.slice(0, 500) })
        link = null
      } else if (!self) {
        const target = name === "text:a" ? attribute(attributes, "xlink:href") : relations.get(attribute(attributes, "r:id") ?? "")
        link = target ? { url: target, text: "" } : null
      }
    } else if (name === dialect.table && !self) {
      if (!close) frames.push({ rows: [], row: null, cell: null })
      else {
        const frame = frames.pop()
        const flat = frame ? frame.rows.flatMap((row) => rowLines(row)) : []
        const parent = frames.at(-1)
        if (parent?.cell) parent.cell.push(...flat)
        else {
          if (lines.length && lines.at(-1) !== "") lines.push("")
          lines.push(...flat, "")
        }
      }
    } else if (name === dialect.row && !self) {
      const frame = frames.at(-1)
      if (!frame) continue
      if (!close) frame.row = []
      else if (frame.row) {
        frame.rows.push(frame.row)
        frame.row = null
      }
    } else if (name === dialect.cell && !self) {
      const frame = frames.at(-1)
      if (!frame?.row) continue
      if (!close) frame.cell = []
      else if (frame.cell) {
        frame.row.push(frame.cell)
        frame.cell = null
      }
    }
  }
  return { lines, links }
}

/** `word/_rels/*.rels`: relationship id → external target. */
export function wordRelations(xml: string): Map<string, string> {
  const map = new Map<string, string>()
  for (const token of tokens(xml)) {
    if ("text" in token || token.name !== "Relationship") continue
    const id = attribute(token.attributes, "Id")
    const target = attribute(token.attributes, "Target")
    if (id && target && attribute(token.attributes, "TargetMode") === "External") map.set(id, target)
  }
  return map
}

const tidy = (lines: string[]) => {
  const out: string[] = []
  for (const line of lines) if (line.trim() || (out.length && out.at(-1) !== "")) out.push(line.trimEnd())
  while (out.at(-1) === "") out.pop()
  return out
}
const merge = (parts: OfficeText[]): OfficeText => {
  const lines: string[] = []
  const seen = new Set<string>()
  for (const part of parts) {
    // A header repeated on each page (or in the body) is read once.
    const fresh = part.lines.filter((line) => !line.trim() || !seen.has(line.trim()))
    for (const line of part.lines) if (line.trim()) seen.add(line.trim())
    if (fresh.some((line) => line.trim())) lines.push(...fresh, "")
  }
  const links: OfficeLink[] = []
  for (const link of parts.flatMap((part) => part.links)) if (!links.some((known) => known.url === link.url)) links.push(link)
  return { lines: tidy(lines), links: links.slice(0, 40) }
}

/**
 * A .docx from its parts: `files` maps archive paths ("word/document.xml",
 * "word/header1.xml", "word/_rels/document.xml.rels"…) to their XML.
 */
export function docxText(files: Record<string, string>): OfficeText {
  const part = (path: string) => {
    const xml = files[path]
    if (!xml) return null
    const relations = wordRelations(files[path.replace(/^word\//, "word/_rels/") + ".rels"] ?? "")
    // Links written as field codes: HYPERLINK "https://…".
    const fields = [...xml.matchAll(/HYPERLINK\s+(?:&quot;|")(https?:[^"&\s]+)(?:&quot;|")/gi)].map((match) => ({ text: "", url: decode(match[1]) }))
    const result = read(xml, WORD, relations)
    return { lines: result.lines, links: [...result.links, ...fields] }
  }
  const named = (pattern: RegExp) => Object.keys(files).filter((path) => pattern.test(path)).sort()
  const parts = [...named(/^word\/header\d*\.xml$/), "word/document.xml", ...named(/^word\/(?:footnotes|endnotes)\.xml$/), ...named(/^word\/footer\d*\.xml$/)]
  return merge(parts.map(part).filter((value): value is OfficeText => value !== null))
}

/** An .odt from its `content.xml` (and `styles.xml`, which holds headers and footers). */
export function odtText(files: Record<string, string>): OfficeText {
  const parts = [files["styles.xml"], files["content.xml"]].filter(Boolean).map((xml) => read(xml.replace(/<text:s(?:\s+text:c="(\d+)")?\s*\/>/g, (_, count?: string) => " ".repeat(Math.min(Number(count ?? 1), 8))), OPEN_DOCUMENT, new Map()))
  return merge(parts)
}
