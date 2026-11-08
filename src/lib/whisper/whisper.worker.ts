/// <reference lib="webworker" />
// Runs Whisper on this device: audio never leaves the browser. The model downloads once and is cached by the browser.
import { env, pipeline, type AutomaticSpeechRecognitionPipeline } from "@huggingface/transformers"

env.allowLocalModels = false
env.useBrowserCache = true
// The runtime comes from Naruvi itself (see scripts/copy-onnx-runtime.mjs), not a CDN.
if (env.backends.onnx.wasm) env.backends.onnx.wasm.wasmPaths = "/ort/"

type Request = { id: number; type: "load"; model: string } | { id: number; type: "transcribe"; model: string; audio: Float32Array; language?: string }

let loaded: { model: string; asr: Promise<AutomaticSpeechRecognitionPipeline> } | null = null
function load(model: string, id: number) {
  if (loaded?.model !== model) {
    const progress_callback = (info: { status: string; file?: string; progress?: number; loaded?: number; total?: number }) => {
      if (info.status === "progress") postMessage({ id, type: "progress", file: info.file, loaded: info.loaded ?? 0, total: info.total ?? 0 })
    }
    // Small 8-bit weights first; custom models without them fall back to the repo's default weights.
    const asr = (pipeline("automatic-speech-recognition", model, { dtype: "q8", progress_callback }) as Promise<AutomaticSpeechRecognitionPipeline>)
      .catch(() => pipeline("automatic-speech-recognition", model, { progress_callback }) as Promise<AutomaticSpeechRecognitionPipeline>)
    loaded = { model, asr }
    asr.catch(() => { if (loaded?.asr === asr) loaded = null })
  }
  return loaded.asr
}

self.onmessage = async (event: MessageEvent<Request>) => {
  const request = event.data
  try {
    const asr = await load(request.model, request.id)
    if (request.type === "load") return postMessage({ id: request.id, type: "ready" })
    const output = await asr(request.audio, { language: request.language, task: "transcribe", chunk_length_s: 30, stride_length_s: 5 })
    const text = (Array.isArray(output) ? output.map((part) => part.text).join(" ") : output.text).trim()
    postMessage({ id: request.id, type: "done", text })
  } catch (error) {
    postMessage({ id: request.id, type: "error", message: error instanceof Error ? error.message : String(error) })
  }
}
