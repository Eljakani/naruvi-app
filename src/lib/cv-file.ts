/**
 * Reads an uploaded CV file into text: PDF, Word, OpenDocument, text, HTML.
 * Runs on the server; kept free of server-only imports so the offline evals
 * can read the fixture CVs.
 */
import { docxText, odtText } from "@/lib/office-text"
import { cleanLines } from "@/lib/pdf-layout"
import { pdfContent } from "@/lib/pdf-content"

export type CvLink = { text: string; url: string }
/** Why a file gave no usable text. Each has its own message, so the person knows what to do next. */
export type CvFileProblem = "scan" | "encrypted" | "legacyWord" | "image" | "unsupported" | "empty" | "damaged"
/** Things the person should know about a file that was read. */
export type CvFileNote = { code: "pagesWithoutText" | "pagesNotRead"; count: number }
export type CvFile =
  | { ok: true; kind: "pdf" | "docx" | "odt" | "text"; text: string; links: CvLink[]; notes: CvFileNote[] }
  | { ok: true; kind: "linkedin"; files: Record<string, string> }
  | { ok: false; problem: CvFileProblem }

const MIN_TEXT = 80
const starts = (bytes: Uint8Array, ...signature: number[]) => signature.every((byte, index) => bytes[index] === byte)
const finish = (lines: string[]) => cleanLines(lines).join("\n").replace(/\n{3,}/g, "\n\n").trim()

function decodeText(bytes: Uint8Array): string | null {
  if (starts(bytes, 0xff, 0xfe)) return new TextDecoder("utf-16le").decode(bytes)
  if (starts(bytes, 0xfe, 0xff)) return new TextDecoder("utf-16be").decode(bytes)
  const sample = bytes.subarray(0, 4000)
  // Binary formats have NUL and control bytes; text has none.
  if (sample.some((byte) => byte === 0 || (byte < 9 && byte > 0) || (byte > 13 && byte < 32 && byte !== 27))) return null
  const text = new TextDecoder("utf-8").decode(bytes).replace(/^\ufeff/, "")
  if ((text.match(/�/g)?.length ?? 0) > text.length * 0.02) return new TextDecoder("windows-1252").decode(bytes)
  return text
}

/** A CV saved as a web page: block tags become line breaks. */
function htmlText(html: string): string {
  return html
    .replace(/<(script|style|head|noscript|template)\b[\s\S]*?<\/\1>/gi, " ")
    .replace(/<(?:br|\/p|\/div|\/li|\/h[1-6]|\/tr|\/section|\/article|\/ul|\/ol|\/table)\b[^>]*>/gi, "\n")
    .replace(/<li\b[^>]*>/gi, "• ")
    .replace(/<\/t[dh]>/gi, "   ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .split("\n").map((line) => line.replace(/[ \t]+/g, " ").trim()).join("\n")
}
const htmlLinks = (html: string): CvLink[] =>
  [...html.matchAll(/<a\b[^>]*href=["'](https?:[^"']+|mailto:[^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)].slice(0, 40).map((match) => ({ url: match[1], text: match[2].replace(/<[^>]+>/g, "").trim().slice(0, 80) }))

/** Reads an uploaded CV or LinkedIn export. Never throws: a file that can't be read says why. */
export async function readCvFile(bytes: Uint8Array, name = ""): Promise<CvFile> {
  if (!bytes.length) return { ok: false, problem: "empty" }
  if (starts(bytes, 0x25, 0x50, 0x44, 0x46)) {
    let content: Awaited<ReturnType<typeof pdfContent>>
    try {
      content = await pdfContent(bytes)
    } catch (error) {
      return { ok: false, problem: /password/i.test(error instanceof Error ? `${error.name} ${error.message}` : "") ? "encrypted" : "damaged" }
    }
    // A scan has pages but no text layer.
    if (content.text.length < MIN_TEXT) return { ok: false, problem: content.pages ? "scan" : "empty" }
    const notes: CvFileNote[] = []
    if (content.emptyPages) notes.push({ code: "pagesWithoutText", count: content.emptyPages })
    if (content.truncated) notes.push({ code: "pagesNotRead", count: content.pages })
    return { ok: true, kind: "pdf", text: content.text, links: content.links, notes }
  }
  if (starts(bytes, 0x50, 0x4b)) {
    const { unzipSync, strFromU8 } = await import("fflate")
    let archive: Record<string, Uint8Array>
    try {
      archive = unzipSync(bytes, { filter: (file) => file.originalSize < 12_000_000 && /\.(xml|rels|csv)$/i.test(file.name) })
    } catch {
      return { ok: false, problem: "damaged" }
    }
    const files = Object.fromEntries(Object.entries(archive).map(([path, data]) => [path, strFromU8(data)]))
    const office = files["word/document.xml"] ? { kind: "docx" as const, ...docxText(files) } : files["content.xml"] && !Object.keys(files).some((path) => /\.csv$/i.test(path)) ? { kind: "odt" as const, ...odtText(files) } : null
    if (office) {
      const text = finish(office.lines)
      // A Word file that only wraps pictures of a CV.
      if (text.length < MIN_TEXT) return { ok: false, problem: "scan" }
      return { ok: true, kind: office.kind, text, links: office.links, notes: [] }
    }
    const csv = Object.fromEntries(Object.entries(files).filter(([path, data]) => /\.csv$/i.test(path) && data.length < 5_000_000))
    return Object.keys(csv).length ? { ok: true, kind: "linkedin", files: csv } : { ok: false, problem: "unsupported" }
  }
  if (/\.csv$/i.test(name)) return { ok: true, kind: "linkedin", files: { [name]: decodeText(bytes) ?? "" } }
  // Old binary Word, and pictures of a CV.
  if (starts(bytes, 0xd0, 0xcf, 0x11, 0xe0)) return { ok: false, problem: "legacyWord" }
  if (starts(bytes, 0x89, 0x50, 0x4e, 0x47) || starts(bytes, 0xff, 0xd8, 0xff) || starts(bytes, 0x47, 0x49, 0x46) || (starts(bytes, 0x52, 0x49, 0x46, 0x46) && bytes[8] === 0x57) || starts(bytes, 0x49, 0x49, 0x2a) || starts(bytes, 0x4d, 0x4d, 0x00, 0x2a)) return { ok: false, problem: "image" }
  const decoded = decodeText(bytes)
  if (decoded === null || /^\{\\rtf/.test(decoded)) return { ok: false, problem: "unsupported" }
  const html = /<html[\s>]|<!doctype html|<body[\s>]/i.test(decoded.slice(0, 2000))
  const text = finish((html ? htmlText(decoded) : decoded).split(/\r?\n/))
  if (text.length < MIN_TEXT) return { ok: false, problem: "empty" }
  return { ok: true, kind: "text", text, links: html ? htmlLinks(decoded) : [], notes: [] }
}
