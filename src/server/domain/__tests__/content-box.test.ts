import assert from "node:assert/strict"
import test from "node:test"

test("contentBox ignores a thin frame and finds the centred mark", async () => {
  const { contentBox } = await import("../../assets/image")
  const w = 200
  const h = 120
  const data = new Uint8Array(w * h * 4)
  for (let y = 0; y < h; y += 1)
    for (let x = 0; x < w; x += 1) {
      const i = (y * w + x) * 4
      const frame = x === 0 || y === 0 || x === w - 1 || y === h - 1
      const mark = x >= 90 && x < 110 && y >= 50 && y < 70
      const v = frame || mark ? 255 : 0
      data.set([v, v, v, 255], i)
    }
  assert.deepEqual(contentBox(data, w, h), { left: 90, top: 50, width: 20, height: 20 })
})
