// Trims the transparent margin of each otter pose and writes a light WebP for the app (max 360px tall).
import sharp from "sharp"
import { readdir } from "node:fs/promises"
const dir = "public/mascot"
const files = (await readdir(dir)).filter((name) => /^naruvi-otter-.*-v1\.png$/.test(name) || name === "naruvi-otter-concept-v1.png")
for (const file of files) {
  const out = `${dir}/web/${file.replace(/^naruvi-otter-/, "").replace(/-v1\.png$/, ".webp")}`
  const info = await sharp(`${dir}/${file}`).trim({ threshold: 8 }).resize({ height: 360, fit: "inside", withoutEnlargement: true }).webp({ quality: 86, alphaQuality: 90 }).toFile(out)
  console.log(out, `${info.width}x${info.height}`, `${Math.round(info.size / 1024)} KB`)
}
