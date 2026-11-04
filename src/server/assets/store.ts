import "server-only"
import { createHash } from "node:crypto"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { join, resolve, sep } from "node:path"
import { IMAGE_MIME, type ImageFormat, imageSize, logoShapeWarning, sniffImage } from "./image"

/** Local, content-addressed asset store (a Docker volume in compose). */
export const ASSETS_DIR = resolve(process.env.ASSETS_DIR || "data/assets")
export const MAX_IMAGE_BYTES = 2 * 1024 * 1024
const ASSET_PATH = /^(logos\/[a-f0-9]{24}\.(png|jpg|gif|webp|svg|ico)|photos\/[a-f0-9]{24}\.(png|jpg|webp))$/

export function isAssetPath(value: string): boolean {
  return ASSET_PATH.test(value)
}

function absolute(path: string) {
  if (!isAssetPath(path)) throw new Error("Invalid asset path.")
  const abs = resolve(ASSETS_DIR, path)
  if (!abs.startsWith(ASSETS_DIR + sep)) throw new Error("Invalid asset path.")
  return abs
}

/** SVG is accepted only without scripts, event handlers or external references. */
function assertSafeSvg(buffer: Buffer) {
  const text = buffer.toString("utf8")
  if (/<script|\bon[a-z]+\s*=|javascript:|<foreignObject|<iframe|<embed|<object|xlink:href=["']https?:|href=["']https?:/i.test(text)) {
    throw new Error("This SVG contains scripts or external references. Export it as PNG or a plain SVG.")
  }
}

export type StoredImage = { path: string; width: number | null; height: number | null; warning: string | null }

export async function storeLogo(buffer: Buffer): Promise<StoredImage> {
  return storeImage(buffer, "logos")
}

/** Photos: raster only, square-ish advice differs (they are cropped to a circle). */
export async function storePhoto(buffer: Buffer): Promise<StoredImage> {
  return storeImage(buffer, "photos")
}

async function storeImage(buffer: Buffer, folder: "logos" | "photos"): Promise<StoredImage> {
  if (buffer.length === 0) throw new Error("The file is empty.")
  if (buffer.length > MAX_IMAGE_BYTES) throw new Error("Images must be 2 MB or smaller.")
  const format = sniffImage(buffer)
  if (!format) throw new Error("Unsupported image. Use PNG, JPG, WebP, GIF, SVG or ICO.")
  if (folder === "photos" && !["png", "jpg", "webp"].includes(format)) throw new Error("Use a PNG, JPG or WebP photo.")
  if (format === "svg") assertSafeSvg(buffer)
  const size = imageSize(buffer)
  const hash = createHash("sha256").update(buffer).digest("hex").slice(0, 24)
  const path = `${folder}/${hash}.${format}`
  await mkdir(join(ASSETS_DIR, folder), { recursive: true })
  await writeFile(absolute(path), buffer)
  const warning =
    folder === "photos"
      ? size && Math.min(size.width, size.height) < 200
        ? `This photo is only ${size.width}×${size.height}px and will look blurry when printed.`
        : null
      : logoShapeWarning(size)
  return { path, width: size?.width ?? null, height: size?.height ?? null, warning }
}

export async function readAsset(path: string): Promise<{ buffer: Buffer; mime: string } | null> {
  try {
    const buffer = await readFile(absolute(path))
    const format = path.split(".").pop() as ImageFormat
    return { buffer, mime: IMAGE_MIME[format] }
  } catch {
    return null
  }
}
