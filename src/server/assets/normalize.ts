import "server-only"
import sharp from "sharp"
import { assertImageBudget, IMAGE_PIXEL_LIMIT, LOGO_ANALYSIS_EDGE } from "./image-budget"
import { contentBox, imageSize, sniffImage } from "./image"

/**
 * Crop a raster logo to its content (e.g. a small mark centred on a huge
 * social canvas), keep a small margin, re-encode as PNG. SVG/ICO untouched.
 */
export async function trimLogo(buffer: Buffer): Promise<{ buffer: Buffer; width: number; height: number } | null> {
  const format = sniffImage(buffer)
  if (!format) return null
  try { assertImageBudget(imageSize(buffer)) } catch { return null }
  if (format === "svg" || format === "ico") {
    const size = imageSize(buffer)
    return size ? { buffer, ...size } : { buffer, width: 0, height: 0 }
  }
  try {
    const image = sharp(buffer, { animated: false, limitInputPixels: IMAGE_PIXEL_LIMIT }).resize(LOGO_ANALYSIS_EDGE, LOGO_ANALYSIS_EDGE, { fit: "inside", withoutEnlargement: true }).ensureAlpha()
    const normalized = await image.png().toBuffer()
    const { data, info } = await sharp(normalized, { limitInputPixels: IMAGE_PIXEL_LIMIT }).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
    const box = contentBox(data, info.width, info.height)
    if (!box) return { buffer: normalized, width: info.width, height: info.height }
    const pad = Math.round(Math.max(box.width, box.height) * 0.06)
    const left = Math.max(0, box.left - pad)
    const top = Math.max(0, box.top - pad)
    const region = { left, top, width: Math.min(info.width - left, box.width + pad * 2), height: Math.min(info.height - top, box.height + pad * 2) }
    const out = await sharp(normalized, { animated: false, limitInputPixels: IMAGE_PIXEL_LIMIT }).extract(region).png().toBuffer({ resolveWithObject: true })
    return { buffer: out.data, width: out.info.width, height: out.info.height }
  } catch {
    return null
  }
}
