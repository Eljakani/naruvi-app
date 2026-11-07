/** Export Naruvi's approved otter artwork for the sidebar, browser tabs and home screens. */
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const root = new URL('../', import.meta.url)
const source = new URL('public/mascot/naruvi-app-icon-master-v2.png', root)
const output = new URL('public/brand/', root)
await mkdir(output, { recursive: true })

// The face-first master is full bleed: keep the ears and face inside the
// source bounds and apply the rounded tile only when exporting.
const artwork = await sharp(fileURLToPath(source)).resize(1134, 1134).png().toBuffer()
const mask = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="1134" height="1134"><rect width="1134" height="1134" rx="200" fill="white"/></svg>')
const tile = await sharp(artwork).composite([{ input: mask, blend: 'dest-in' }]).png().toBuffer()

// Only the sizes the app shows: the sidebar mark (128) and Naruvi's face in the assistant (64).
for (const size of [64, 128]) {
  await sharp(tile).resize(size, size).png().toFile(fileURLToPath(new URL(`naruvi-otter-${size}-v2.png`, output)))
}
// Apple applies its own corner mask, so its source is opaque.
await sharp(tile).flatten({ background: '#fff5e3' }).resize(180, 180).png().toFile(fileURLToPath(new URL('src/app/apple-icon.png', root)))

// Browser tabs use the reference-inspired floating otter on a sage tile,
// independently of the close-up sidebar and home-screen artwork.
const favicon = new URL('public/mascot/naruvi-favicon-floating-v1.png', root)
const faviconTile = await sharp(fileURLToPath(favicon)).resize(1134, 1134).composite([{ input: mask, blend: 'dest-in' }]).png().toBuffer()
await sharp(faviconTile).resize(512, 512).png().toFile(fileURLToPath(new URL('src/app/icon.png', root)))
await rm(new URL('src/app/icon.svg', root), { force: true })

// ICO supports PNG frames; include native small sizes rather than relying on
// a browser to scale a large launcher image down to a 16px tab icon.
const sizes = [16, 32, 48, 64, 128, 256]
const frames = await Promise.all(sizes.map(size => sharp(faviconTile).resize(size, size).png().toBuffer()))
const header = Buffer.alloc(6 + 16 * frames.length)
header.writeUInt16LE(1, 2)
header.writeUInt16LE(frames.length, 4)
let offset = header.length
frames.forEach((frame, index) => {
  const entry = 6 + index * 16
  header[entry] = sizes[index] === 256 ? 0 : sizes[index]
  header[entry + 1] = header[entry]
  header.writeUInt16LE(1, entry + 4)
  header.writeUInt16LE(32, entry + 6)
  header.writeUInt32LE(frame.length, entry + 8)
  header.writeUInt32LE(offset, entry + 12)
  offset += frame.length
})
await writeFile(new URL('src/app/favicon.ico', root), Buffer.concat([header, ...frames]))
console.log('Exported sidebar icons, app icon, Apple touch icon, and six favicon sizes.')
