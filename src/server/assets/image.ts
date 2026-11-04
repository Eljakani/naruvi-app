/** Pure image helpers: format sniffing and dimensions from bytes. */

export type ImageFormat = "png" | "jpg" | "gif" | "webp" | "svg" | "ico"

export const IMAGE_MIME: Record<ImageFormat, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
  ico: "image/x-icon",
}

/** Detect the real format from the bytes; the filename and content-type are not trusted. */
export function sniffImage(buffer: Buffer): ImageFormat | null {
  if (buffer.length < 12) return null
  if (buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "png"
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "jpg"
  if (buffer.toString("ascii", 0, 4) === "GIF8") return "gif"
  if (buffer[0] === 0 && buffer[1] === 0 && buffer[2] === 1 && buffer[3] === 0 && buffer[4] > 0) return "ico"
  if (buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP") return "webp"
  const head = buffer.subarray(0, 1024).toString("utf8").replace(/^﻿/, "").trimStart().toLowerCase()
  if (head.startsWith("<svg") || (head.startsWith("<?xml") && head.includes("<svg"))) return "svg"
  return null
}

export function imageSize(buffer: Buffer): { width: number; height: number } | null {
  const b = buffer
  if (b.length < 24) return null
  const format = sniffImage(b)
  if (format === "png") return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) }
  if (format === "gif") return { width: b.readUInt16LE(6), height: b.readUInt16LE(8) }
  if (format === "ico") {
    // Largest image in the directory; 0 means 256.
    let best = 0
    for (let i = 0; i < b.readUInt16LE(4) && 6 + i * 16 + 1 < b.length; i += 1) best = Math.max(best, b[6 + i * 16] || 256)
    return { width: best, height: best }
  }
  if (format === "webp") {
    const kind = b.toString("ascii", 12, 16)
    if (kind === "VP8X") return { width: 1 + b.readUIntLE(24, 3), height: 1 + b.readUIntLE(27, 3) }
    if (kind === "VP8 ") return { width: b.readUInt16LE(26) & 0x3fff, height: b.readUInt16LE(28) & 0x3fff }
    if (kind === "VP8L") {
      const bits = b.readUInt32LE(21)
      return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 }
    }
  }
  if (format === "jpg") {
    let offset = 2
    while (offset + 9 < b.length) {
      if (b[offset] !== 0xff) {
        offset += 1
        continue
      }
      const marker = b[offset + 1]
      const length = b.readUInt16BE(offset + 2)
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
        return { width: b.readUInt16BE(offset + 7), height: b.readUInt16BE(offset + 5) }
      }
      offset += 2 + length
    }
  }
  if (format === "svg") {
    const head = b.subarray(0, 4096).toString("utf8")
    const viewBox = head.match(/viewBox=["']\s*[-\d.]+[\s,]+[-\d.]+[\s,]+([\d.]+)[\s,]+([\d.]+)/i)
    if (viewBox) return { width: Number(viewBox[1]), height: Number(viewBox[2]) }
  }
  return null
}

/** Advice for a logo slot (square on the CV). */
export function logoShapeWarning(size: { width: number; height: number } | null): string | null {
  if (!size || !size.width || !size.height) return null
  const aspect = size.width / size.height
  if (aspect > 2.2 || aspect < 1 / 2.2) return `This image is ${aspect >= 1 ? `${aspect.toFixed(1)}:1` : `1:${(1 / aspect).toFixed(1)}`}; in the square logo slot it will look tiny. Prefer a square mark.`
  if (Math.min(size.width, size.height) < 48) return `This image is only ${size.width}×${size.height}px and may look blurry.`
  return null
}

export type Box = { left: number; top: number; width: number; height: number }

/**
 * Bounding box of the "ink" in an RGBA buffer. The background colour is the
 * most common colour sampled a few pixels inside the edges, so thin frames
 * (a 1px white border around a black canvas) do not fool it.
 */
export function contentBox(data: Buffer | Uint8Array, width: number, height: number, tolerance = 48): Box | null {
  const at = (x: number, y: number) => (y * width + x) * 4
  const inset = Math.min(4, Math.floor(Math.min(width, height) / 10))
  const counts = new Map<string, { n: number; rgba: number[] }>()
  const sample = (x: number, y: number) => {
    const i = at(x, y)
    const rgba = [data[i], data[i + 1], data[i + 2], data[i + 3]]
    const key = rgba.map((v) => v >> 4).join(",")
    const entry = counts.get(key) ?? { n: 0, rgba }
    entry.n += 1
    counts.set(key, entry)
  }
  for (let x = inset; x < width - inset; x += Math.max(1, Math.floor(width / 200))) {
    sample(x, inset)
    sample(x, height - 1 - inset)
  }
  for (let y = inset; y < height - inset; y += Math.max(1, Math.floor(height / 200))) {
    sample(inset, y)
    sample(width - 1 - inset, y)
  }
  const bg = [...counts.values()].sort((a, b) => b.n - a.n)[0]?.rgba
  if (!bg) return null
  const differs = (i: number) => {
    // Fully transparent pixels count as background whatever their colour.
    if (data[i + 3] < 16 && bg[3] < 16) return false
    return Math.abs(data[i] - bg[0]) + Math.abs(data[i + 1] - bg[1]) + Math.abs(data[i + 2] - bg[2]) + Math.abs(data[i + 3] - bg[3]) > tolerance
  }
  let minX = width
  let minY = height
  let maxX = -1
  let maxY = -1
  for (let y = inset; y < height - inset; y += 1) {
    for (let x = inset; x < width - inset; x += 1) {
      if (!differs(at(x, y))) continue
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y
    }
  }
  if (maxX < 0) return null
  return { left: minX, top: minY, width: maxX - minX + 1, height: maxY - minY + 1 }
}

