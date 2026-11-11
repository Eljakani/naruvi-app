import "server-only"
import { request as httpRequest } from "node:http"
import { request as httpsRequest } from "node:https"
import { createGunzip, createInflate, createBrotliDecompress } from "node:zlib"
import { resolvePublicAddress } from "./public-url"

export async function assertPublicUrl(url: URL) { await resolvePublicAddress(url) }
export type FetchResult = { buffer: Buffer; contentType: string; finalUrl: string; status: number; headers?: Record<string, string> }

/** Resolve once per redirect, then pin the socket to that vetted address. URL host/SNI stay intact. */
/** `truncate`: keep the first `maxBytes` of a larger body instead of failing (enough for a page's <head>). */
export async function safeFetch(rawUrl: string, { maxBytes, accept, timeoutMs = 15_000, origin, truncate = false }: { maxBytes: number; accept: string; timeoutMs?: number; origin?: string; truncate?: boolean }): Promise<FetchResult> {
  let url = new URL(rawUrl)
  const deadline = Date.now() + timeoutMs
  for (let hop = 0; hop < 6; hop++) {
    let dnsTimer: ReturnType<typeof setTimeout> | undefined
    const address = await Promise.race([
      resolvePublicAddress(url),
      new Promise<never>((_resolve, reject) => { dnsTimer = setTimeout(() => reject(new Error("DNS lookup timed out.")), Math.max(1, deadline - Date.now())) }),
    ]).finally(() => clearTimeout(dnsTimer))
    const remaining = deadline - Date.now()
    if (remaining <= 0) throw new Error("Request timed out.")
    const options: import("node:http").RequestOptions & { autoSelectFamily: boolean } = {
      agent: false, autoSelectFamily: false,
      lookup: (_host, _options, callback) => callback(null, address.address, address.family),
      signal: AbortSignal.timeout(remaining),
      headers: { accept, "accept-encoding": "identity", ...(origin ? { origin } : {}), "accept-language": "en-US,en;q=0.9,fr;q=0.8", "user-agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36 Naruvi/0.1" },
    }
    const request = (url.protocol === "https:" ? httpsRequest : httpRequest)(url, options)
    try {
      const response = await new Promise<import("node:http").IncomingMessage>((resolve, reject) => {
        request.once("response", resolve)
        request.once("error", reject)
        request.end()
      })
      const status = response.statusCode || 502
      const location = response.headers.location
      if (status >= 300 && status < 400 && location) { response.destroy(); url = new URL(location, url); continue }
      if (!truncate && Number(response.headers["content-length"] || 0) > maxBytes) { response.destroy(); throw new Error("The response is too large.") }
      const encoding = response.headers["content-encoding"]
      const decoder = encoding === "gzip" ? createGunzip() : encoding === "deflate" ? createInflate() : encoding === "br" ? createBrotliDecompress() : null
      if (encoding && encoding !== "identity" && !decoder) { response.destroy(); throw new Error("Unsupported response encoding.") }
      const stream = decoder ? response.pipe(decoder) : response
      // Forward socket errors to the decompressor so aborted compressed bodies cannot hang.
      if (decoder) response.on("error", error => decoder.destroy(error))
      const chunks: Buffer[] = []
      let size = 0
      try {
        for await (const chunk of stream) {
          const bytes = Buffer.from(chunk)
          size += bytes.length
          if (size > maxBytes) {
            if (!truncate) throw new Error("The response is too large.")
            chunks.push(bytes.subarray(0, bytes.length - (size - maxBytes)))
            break
          }
          chunks.push(bytes)
        }
      } finally { stream.destroy(); response.destroy() }
      const headers = Object.fromEntries(Object.entries(response.headers).filter(([name]) => name.startsWith("access-control-")).map(([name, value]) => [name, Array.isArray(value) ? value.join(", ") : value || ""]))
      return { buffer: Buffer.concat(chunks), contentType: response.headers["content-type"] || "", finalUrl: url.toString(), status, headers }
    } finally { request.destroy() }
  }
  throw new Error("Too many redirects.")
}
export async function safeFetchBytes(rawUrl: string, maxBytes: number, accept = "image/*"): Promise<Buffer> {
  const result = await safeFetch(rawUrl, { maxBytes, accept })
  if (result.status >= 400) throw new Error(`The server answered ${result.status}.`)
  return result.buffer
}
export async function safeFetchText(rawUrl: string, maxBytes = 3 * 1024 * 1024) {
  const result = await safeFetch(rawUrl, { maxBytes, accept: "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.5" })
  return { ...result, text: result.buffer.toString("utf8") }
}
