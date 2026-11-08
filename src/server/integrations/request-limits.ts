export const API_BODY_BYTES = 512 * 1024
export class RequestLimitError extends Error {
  constructor(public status: number, message: string) { super(message) }
}
/** Limit bytes before JSON parsing, including chunked requests without Content-Length. */
export async function boundedApiRequest(request: Request, maxBytes = API_BODY_BYTES) {
  if (["GET", "HEAD", "OPTIONS"].includes(request.method)) return request
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) throw new RequestLimitError(415, "Use application/json.")
  if (request.headers.get("content-encoding") && request.headers.get("content-encoding") !== "identity") throw new RequestLimitError(415, "Compressed request bodies are not supported.")
  if (Number(request.headers.get("content-length")) > maxBytes) throw new RequestLimitError(413, "Request body is too large.")
  const reader = request.body?.getReader()
  const chunks: Uint8Array[] = []
  const deadline = Date.now() + 10_000
  let bytes = 0
  if (reader) try {
    while (true) {
      if (Date.now() >= deadline) throw new RequestLimitError(408, "Request body timed out.")
      let timer: ReturnType<typeof setTimeout> | undefined
      const chunk = await Promise.race([reader.read(), new Promise<null>(resolve => { timer = setTimeout(() => resolve(null), Math.max(0, deadline - Date.now())) })]).finally(() => clearTimeout(timer))
      if (!chunk) throw new RequestLimitError(408, "Request body timed out.")
      if (chunk.done) break
      bytes += chunk.value.byteLength
      if (bytes > maxBytes) throw new RequestLimitError(413, "Request body is too large.")
      chunks.push(chunk.value)
    }
  } catch (error) { void reader.cancel().catch(() => {}); throw error }
  const body = new Uint8Array(bytes)
  let offset = 0
  for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.length }
  // Rebuilt from parts: passing a framework Request subclass to `new Request()` throws (#state).
  return new Request(request.url, { method: request.method, headers: request.headers, body, signal: request.signal })
}
