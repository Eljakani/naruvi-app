/**
 * Text of a PDF in reading order, with the links behind its words. Runs on the
 * server (pdf.js is loaded on demand); kept free of server-only imports so the
 * offline evals can read the fixture CVs.
 */
import { cleanLines, dropRunningLines, layoutPage, type TextRun } from "@/lib/pdf-layout"

export type PdfLink = { text: string; url: string }
export type PdfContent = {
  text: string
  /** Links attached to words or icons: the address is not in the visible text. */
  links: PdfLink[]
  pages: number
  /** Pages that hold no text at all (a scan or a picture). */
  emptyPages: number
  /** More pages than are read. */
  truncated: boolean
}

const MAX_PAGES = 15

/** Text of a PDF (CV) in reading order, page by page, with the links behind its words. */
export async function pdfContent(data: Uint8Array): Promise<PdfContent> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs")
  const doc = await pdfjs.getDocument({ data, useSystemFonts: false, disableFontFace: true, verbosity: 0 }).promise
  const pages: string[][] = []
  const links: PdfLink[] = []
  let emptyPages = 0
  const count = Math.min(doc.numPages, MAX_PAGES)
  for (let n = 1; n <= count; n += 1) {
    const page = await doc.getPage(n)
    const width = page.getViewport({ scale: 1 }).width
    const content = await page.getTextContent()
    const runs: TextRun[] = []
    for (const item of content.items) {
      if (!("str" in item) || !item.str) continue
      const [, , , size, x, y] = item.transform as number[]
      runs.push({ str: item.str, x, y, width: item.width ?? 0, height: Math.abs(item.height || size || 10) })
    }
    if (!runs.some((run) => run.str.trim())) emptyPages += 1
    pages.push(layoutPage(runs, width).lines)
    const annotations = await page.getAnnotations().catch(() => [])
    for (const annotation of annotations as { subtype?: string; url?: string; unsafeUrl?: string; rect?: number[] }[]) {
      const url = annotation.url ?? annotation.unsafeUrl
      if (annotation.subtype !== "Link" || !url || !/^(https?:|mailto:)/i.test(url) || !annotation.rect) continue
      const [x1, y1, x2, y2] = annotation.rect
      const text = runs.filter((run) => run.str.trim() && run.x + run.width / 2 >= x1 - 1 && run.x + run.width / 2 <= x2 + 1 && run.y >= y1 - 2 && run.y <= y2 + 1).map((run) => run.str.trim()).join(" ")
      if (!links.some((link) => link.url === url)) links.push({ text: text.slice(0, 80), url: url.slice(0, 500) })
    }
  }
  await doc.cleanup?.()
  const text = dropRunningLines(pages.map(cleanLines)).map((page) => page.join("\n")).join("\n\n").replace(/\n{3,}/g, "\n\n").trim()
  return { text, links: links.slice(0, 40), pages: doc.numPages, emptyPages, truncated: doc.numPages > count }
}

/** Plain text of a PDF. */
export async function pdfText(data: Uint8Array): Promise<string> {
  return (await pdfContent(data)).text
}
