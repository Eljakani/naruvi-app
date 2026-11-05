import "server-only"

export type LayoutMetrics = { pages: number; lastPageFill: number; pageFill: number[] }

/** How full each page is (share of the printable height used by text). */
export async function layoutMetrics(buffer: Buffer): Promise<LayoutMetrics> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs")
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buffer), useSystemFonts: false, disableFontFace: true }).promise
  const fills: number[] = []
  for (let n = 1; n <= doc.numPages; n += 1) {
    const page = await doc.getPage(n)
    const height = page.getViewport({ scale: 1 }).height
    const content = await page.getTextContent()
    let top = height
    let bottom = 0
    for (const item of content.items) {
      if (!("str" in item) || !item.str.trim()) continue
      const y = item.transform[5]
      top = Math.min(top, height - y - (item.height || 0))
      bottom = Math.max(bottom, height - y)
    }
    fills.push(bottom > 0 ? Math.min(1, bottom / (height * 0.94)) : 0)
  }
  return { pages: doc.numPages, lastPageFill: fills.at(-1) ?? 0, pageFill: fills }
}
