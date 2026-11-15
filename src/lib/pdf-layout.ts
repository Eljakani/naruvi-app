/**
 * Reading order for the text of one PDF page. Pure: positioned text runs in,
 * lines out. A PDF stores text in whatever order its producer wrote it, so a
 * two-column CV often comes out with a sidebar line glued to a main-column
 * line. Lines are rebuilt from positions, a column gutter is looked for, and
 * each band of the page is read column by column, or row by row when one side
 * is a column of labels or dates that belong to the text next to them.
 */

export type TextRun = { str: string; x: number; y: number; width: number; height: number }
type Line = { y: number; height: number; runs: TextRun[] }

const RTL = /[\u0590-\u08ff\ufb1d-\ufdff\ufe70-\ufeff]/
const DATE_LIKE = /(?:19|20)\d{2}|\b\d{1,2}[/.]\d{2,4}\b/

/** Runs that share a baseline, top of the page first. */
function toLines(runs: TextRun[]): Line[] {
  const sorted = [...runs].sort((a, b) => b.y - a.y || a.x - b.x)
  const lines: Line[] = []
  for (const run of sorted) {
    const height = run.height || 10
    const line = lines.at(-1)
    if (line && Math.abs(line.y - run.y) <= Math.min(line.height, height) * 0.35) {
      line.runs.push(run)
      line.height = Math.max(line.height, height)
    } else lines.push({ y: run.y, height, runs: [run] })
  }
  return lines
}

const RTL_LETTER = /[\u05d0-\u05ea\u0620-\u064a\u0671-\u06d3\ufb1d-\ufdff\ufe70-\ufefc]/
const LATIN = /[A-Za-z\u00c0-\u024f]/

/**
 * One line's runs as text. On a right-to-left page the line is read from the
 * right; Latin words (and the punctuation between them) keep their own order,
 * as the bidirectional algorithm lays them out.
 */
function joinRuns(runs: TextRun[], rtl: boolean): string {
  const visible = runs.filter((run) => run.str.length)
  if (!visible.length) return ""
  let ordered = [...visible].sort((a, b) => a.x - b.x)
  if (rtl) {
    ordered.reverse()
    const kind = ordered.map((run) => (RTL_LETTER.test(run.str) ? "R" : LATIN.test(run.str) ? "L" : "N"))
    const fixed: TextRun[] = []
    for (let index = 0; index < ordered.length; index += 1) {
      if (kind[index] !== "L") {
        fixed.push(ordered[index])
        continue
      }
      // Extend over neutral runs that sit between two Latin runs.
      let end = index
      for (let next = index + 1; next < ordered.length; next += 1) {
        if (kind[next] === "L") end = next
        else if (kind[next] === "R") break
      }
      fixed.push(...ordered.slice(index, end + 1).reverse())
      index = end
    }
    ordered = fixed
  }
  let text = ""
  let previous: TextRun | null = null
  for (const run of ordered) {
    if (previous && text && !/\s$/.test(text) && !/^\s/.test(run.str)) {
      const gap = Math.max(run.x, previous.x) - Math.min(run.x + run.width, previous.x + previous.width)
      const size = Math.max(run.height, previous.height) || 10
      // Only a visible gap is a space: glyph runs split mid-word (diacritics, kerning) join directly.
      if (gap > size * 0.2) text += gap > size * 3 ? "   " : " "
    }
    text += run.str
    previous = run
  }
  return text.trim()
}

/** The widest empty vertical band near the middle that most lines respect, or null. */
function findGutter(lines: Line[], width: number): { from: number; to: number } | null {
  if (lines.length < 8 || width <= 0) return null
  const step = 2
  const bins = new Array<number>(Math.ceil(width / step) + 1).fill(0)
  for (const line of lines) {
    const covered = new Set<number>()
    for (const run of line.runs) {
      if (!run.str.trim()) continue
      for (let bin = Math.max(0, Math.floor(run.x / step)); bin <= Math.min(bins.length - 1, Math.floor((run.x + run.width) / step)); bin += 1) covered.add(bin)
    }
    for (const bin of covered) bins[bin] += 1
  }
  // The emptiest band wins: first one no line crosses, then bands a few full-width lines (headings, the name) cross.
  const allowed = Math.max(1, Math.floor(lines.length * 0.2))
  const first = Math.floor((width * 0.18) / step)
  const last = Math.min(bins.length - 1, Math.ceil((width * 0.82) / step))
  const sides = (middle: number) => ({
    left: lines.filter((line) => line.runs.some((run) => run.str.trim() && run.x + run.width <= middle)).length,
    right: lines.filter((line) => line.runs.some((run) => run.str.trim() && run.x >= middle)).length,
  })
  for (let limit = 0; limit <= allowed; limit += 1) {
    let best: { from: number; to: number } | null = null
    let start = -1
    for (let bin = first; bin <= last + 1; bin += 1) {
      const free = bin <= last && bins[bin] <= limit
      if (free && start < 0) start = bin
      if (!free && start >= 0) {
        const band = { from: start * step, to: bin * step }
        const count = sides((band.from + band.to) / 2)
        if (band.to - band.from >= 9 && count.left >= 5 && count.right >= 5 && (!best || band.to - band.from > best.to - best.from)) best = band
        start = -1
      }
    }
    if (best) return best
  }
  return null
}

/** A column of dates or one-word labels names the text beside it; it is not a column of its own. */
function labelLike(texts: string[]): boolean {
  if (!texts.length) return true
  const dated = texts.filter((text) => DATE_LIKE.test(text) && text.length <= 28).length
  const average = texts.reduce((sum, text) => sum + text.length, 0) / texts.length
  return dated / texts.length >= 0.3 || average < 12
}

export type PageLayout = { lines: string[]; columns: boolean }

/** The page's text lines in reading order. An empty string marks a paragraph gap. */
export function layoutPage(runs: TextRun[], pageWidth: number): PageLayout {
  const lines = toLines(runs.filter((run) => run.str.length))
  // A page written right to left is read from the right on every line, Latin-only lines included.
  const letters = runs.map((run) => run.str).join("")
  const rtl = (letters.match(new RegExp(RTL.source, "g"))?.length ?? 0) > (letters.match(/\p{L}/gu)?.length ?? 0) * 0.3
  const join = (line: TextRun[]) => joinRuns(line, rtl)
  const gutter = findGutter(lines.filter((line) => line.runs.some((run) => run.str.trim())), pageWidth)
  const out: string[] = []
  let columns = false
  let lastY: number | null = null
  let lastHeight = 10
  const gap = (line: Line) => {
    if (lastY !== null && lastY - line.y > Math.max(lastHeight, line.height) * 1.9 && out.at(-1) !== "") out.push("")
    lastY = line.y
    lastHeight = line.height
  }
  if (!gutter) {
    for (const line of lines) {
      const text = join(line.runs)
      if (!text) continue
      gap(line)
      out.push(text)
    }
    return { lines: out, columns }
  }
  const middle = (gutter.from + gutter.to) / 2
  type Row = { line: Line; left: string; right: string }
  let band: Row[] = []
  const flush = () => {
    if (!band.length) return
    const lefts = band.filter((row) => row.left)
    const rights = band.filter((row) => row.right)
    const split = lefts.length >= 4 && rights.length >= 4 && !labelLike(lefts.map((row) => row.left)) && !labelLike(rights.map((row) => row.right))
    if (split) {
      columns = true
      for (const side of rtl ? (["right", "left"] as const) : (["left", "right"] as const)) {
        lastY = null
        if (out.length && out.at(-1) !== "") out.push("")
        for (const row of band) {
          if (!row[side]) continue
          gap(row.line)
          out.push(row[side])
        }
      }
    } else {
      for (const row of band) {
        gap(row.line)
        out.push((rtl ? [row.right, row.left] : [row.left, row.right]).filter(Boolean).join("   "))
      }
    }
    band = []
  }
  for (const line of lines) {
    const visible = line.runs.filter((run) => run.str.trim())
    if (!visible.length) continue
    const crossing = visible.some((run) => run.x < gutter.from - 1 && run.x + run.width > gutter.to + 1)
    if (crossing) {
      flush()
      gap(line)
      out.push(join(line.runs))
      continue
    }
    band.push({ line, left: join(line.runs.filter((run) => run.x + run.width / 2 < middle)), right: join(line.runs.filter((run) => run.x + run.width / 2 >= middle)) })
  }
  flush()
  while (out.at(-1) === "") out.pop()
  return { lines: out, columns }
}

/* ------------------------------------------------------------------ whole document */

const PRESENTATION = /[\ufb00-\ufdff\ufe70-\ufefc]+/g
// pdf.js reverses the two letters of a lam-alef ligature: "الآن" arrives as alef + alef-madda + lam. Two alefs then lam is never a real spelling.
const REVERSED_LAM_ALEF = /\u0627([\u0622\u0623\u0625\u0627])\u0644/g
const BULLET = /^[\u2022\u2023\u25e6\u25aa\u25ab\u25cf\u25cb\u25a0\u25a1\u2043\u2219\u27a2\u2794\u2192\uf0b7\uf0a7\u00b7*]\s*/

/** "E X P E R I E N C E" → "EXPERIENCE": letter-spaced headings come out as single letters. */
function unspace(line: string): string {
  const parts = line.trim().split(/ {2,}/)
  const joined = parts.map((part) => (/^(?:\p{L} ){2,}\p{L}$/u.test(part) ? part.replace(/ /g, "") : null))
  if (joined.every((part) => part !== null)) return joined.join(" ")
  // Kerned capitals are sometimes split unevenly ("E D U C AT I O N").
  const tokens = line.trim().split(" ")
  const single = tokens.filter((token) => token.length === 1).length
  if (tokens.length >= 4 && /^[\p{Lu} &]+$/u.test(line.trim()) && single / tokens.length >= 0.6) return tokens.join("")
  return line
}

/** Tidies extracted lines: ligatures and Arabic presentation forms, bullet glyphs, letter-spaced headings, words hyphenated at a line end. */
export function cleanLines(lines: string[]): string[] {
  const out: string[] = []
  for (const raw of lines) {
    let line = raw.replace(REVERSED_LAM_ALEF, "\u0627\u0644$1").replace(PRESENTATION, (match) => match.normalize("NFKC")).replace(/[\u00a0\u2000-\u200a\u202f\u3000]/g, " ").replace(/[\u200b\u200c\u200d\u200e\u200f\u202a-\u202e\u2066-\u2069\ufeff\u00ad]/g, "").trimEnd()
    line = unspace(line).replace(BULLET, "\u2022 ")
    const previous = out.at(-1)
    // "usability test-" + "ing" is one word; "full-" + "time" keeps its hyphen only when the next line starts a new item.
    if (previous && /\p{Ll}-$/u.test(previous) && /^\p{Ll}/u.test(line) && !/\s/.test(line.slice(0, Math.min(line.length, 2)))) {
      out[out.length - 1] = previous.slice(0, -1) + line
      continue
    }
    // A bullet glyph alone on its line belongs to the text under it.
    if (previous === "\u2022" && line.trim()) {
      out[out.length - 1] = `\u2022 ${line.trim()}`
      continue
    }
    out.push(line === "\u2022 " ? "\u2022" : line)
  }
  return out
}

/** Drops lines that repeat at the top or bottom of every page (running headers, footers, page numbers). */
export function dropRunningLines(pages: string[][]): string[][] {
  const pageNumber = /^(?:page\s*)?\d{1,3}(?:\s*(?:\/|of|sur|de|von)\s*\d{1,3})?$/i
  const key = (line: string) => line.toLowerCase().replace(/\d+/g, "#").replace(/\s+/g, " ").trim()
  const edges = (page: string[]) => {
    const filled = page.filter((line) => line.trim())
    return [...filled.slice(0, 2), ...filled.slice(-2)]
  }
  const counts = new Map<string, number>()
  if (pages.length >= 2) for (const page of pages) for (const line of new Set(edges(page).map(key))) counts.set(line, (counts.get(line) ?? 0) + 1)
  const repeated = new Set([...counts].filter(([, count]) => count >= Math.max(2, Math.ceil(pages.length * 0.6))).map(([line]) => line))
  return pages.map((page, index) => {
    const edge = new Set(edges(page))
    return page.filter((line) => {
      if (!edge.has(line)) return true
      if (pageNumber.test(line.trim())) return false
      // The first page keeps its copy: a header there is usually the person's name.
      return !(repeated.has(key(line)) && index > 0)
    })
  })
}
