import assert from "node:assert/strict"
import test from "node:test"
import { imageSize, logoShapeWarning, sniffImage } from "../../assets/image"

function png(width: number, height: number) {
  const b = Buffer.alloc(33)
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b, 0)
  b.writeUInt32BE(13, 8)
  b.write("IHDR", 12, "ascii")
  b.writeUInt32BE(width, 16)
  b.writeUInt32BE(height, 20)
  return b
}

test("sniffs formats from bytes, not names", () => {
  assert.equal(sniffImage(png(10, 10)), "png")
  assert.equal(sniffImage(Buffer.from('<?xml version="1.0"?><svg viewBox="0 0 24 24"></svg>')), "svg")
  assert.equal(sniffImage(Buffer.from("<html><script>alert(1)</script></html>")), null)
})

test("reads PNG and SVG sizes", () => {
  assert.deepEqual(imageSize(png(256, 128)), { width: 256, height: 128 })
  assert.deepEqual(imageSize(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 40"></svg>')), { width: 120, height: 40 })
})

test("warns about banner-shaped or tiny logos", () => {
  assert.match(logoShapeWarning({ width: 2048, height: 764 }) ?? "", /2\.7:1/)
  assert.match(logoShapeWarning({ width: 32, height: 32 }) ?? "", /blurry/)
  assert.equal(logoShapeWarning({ width: 400, height: 300 }), null)
})
