import "server-only"

/** Plain text of a PDF (CV), page by page, keeping line breaks where the layout has them. */
export async function pdfText(data: Uint8Array): Promise<string> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs")
  const doc = await pdfjs.getDocument({ data, useSystemFonts: false, disableFontFace: true }).promise
  const pages: string[] = []
  for (let n = 1; n <= Math.min(doc.numPages, 12); n += 1) {
    const page = await doc.getPage(n)
    const content = await page.getTextContent()
    let line = ""
    let lastY: number | null = null
    let lastEnd = 0
    const lines: string[] = []
    for (const item of content.items) {
      if (!("str" in item)) continue
      const [, , , size, x, y] = item.transform as number[]
      if (lastY !== null && Math.abs(y - lastY) > 2) {
        lines.push(line.trim())
        line = ""
      }
      // Only a visible gap is a space: glyph runs split mid-word (diacritics, kerning) join directly.
      const gap = x - lastEnd
      const needsSpace = line && !line.endsWith(" ") && !item.str.startsWith(" ") && gap > Math.abs(size || 10) * 0.2
      line += (needsSpace ? " " : "") + item.str
      lastEnd = x + (item.width ?? 0)
      lastY = y
      if (item.hasEOL) {
        lines.push(line.trim())
        line = ""
        lastY = null
      }
    }
    if (line.trim()) lines.push(line.trim())
    pages.push(lines.filter(Boolean).join("\n"))
  }
  await doc.cleanup?.()
  return pages.join("\n\n").replace(/\n{3,}/g, "\n\n").trim()
}
