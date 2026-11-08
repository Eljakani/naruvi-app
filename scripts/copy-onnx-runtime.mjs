// Serves the ONNX WebAssembly runtime from Naruvi itself (public/ort), so local Whisper never loads code from a CDN.
import { copyFileSync, mkdirSync, readdirSync } from "node:fs"
import { join } from "node:path"

const from = join(process.cwd(), "node_modules/onnxruntime-web/dist")
const to = join(process.cwd(), "public/ort")
mkdirSync(to, { recursive: true })
let copied = 0
for (const file of readdirSync(from)) {
  if (/^ort-wasm-simd-threaded.*\.(wasm|mjs)$/.test(file)) { copyFileSync(join(from, file), join(to, file)); copied += 1 }
}
console.log(`[onnx] ${copied} runtime files → public/ort`)
