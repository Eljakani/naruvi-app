/** Pure image helpers: format sniffing and dimensions from bytes. */

export type ImageFormat = "png" | "jpg" | "gif" | "webp" | "svg"

export const IMAGE_MIME: Record<ImageFormat, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
}

/** Detect the real format from the bytes; the filename and content-type are not trusted. */
export function sniffImage(buffer: Buffer): ImageFormat | null {
  if (buffer.length < 12) return null
  if (buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "png"
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "jpg"
  if (buffer.toString("ascii", 0, 4) === "GIF8") return "gif"
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
