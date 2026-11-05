import "server-only"
import { lookup } from "node:dns/promises"
import { isIP } from "node:net"

function privateAddress(address: string): boolean {
  if (isIP(address) === 6) {
    const a = address.toLowerCase()
    if (a.startsWith("::ffff:")) return privateAddress(a.slice(7))
    return a === "::1" || a === "::" || a.startsWith("fc") || a.startsWith("fd") || a.startsWith("fe80")
  }
  const [a, b] = address.split(".").map(Number)
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224
}

export async function assertPublicUrl(url: URL) {
  if (!/^https?:$/.test(url.protocol)) throw new Error("Only http(s) URLs are allowed.")
  const addresses = isIP(url.hostname) ? [{ address: url.hostname }] : await lookup(url.hostname, { all: true })
  if (!addresses.length || addresses.some((item) => privateAddress(item.address))) throw new Error("That address is local or private and is not allowed.")
}

export type FetchResult = { buffer: Buffer; contentType: string; finalUrl: string; status: number; headers?: Record<string, string> }

/**
 * Fetch a public http(s) URL. Every redirect hop is re-checked against private
 * ranges, the body is size-capped while streaming, and the request times out.
 */
export async function safeFetch(rawUrl: string, { maxBytes, accept, timeoutMs = 15_000, origin }: { maxBytes: number; accept: string; timeoutMs?: number; origin?: string }): Promise<FetchResult> {
  let url = new URL(rawUrl)
  for (let hop = 0; hop < 6; hop += 1) {
    await assertPublicUrl(url)
    const response = await fetch(url, {
      redirect: "manual",
      headers: {
        accept,
        ...(origin ? { origin } : {}),
        "accept-language": "en-US,en;q=0.9,fr;q=0.8",
        "user-agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36 Naruvi/0.1",
      },
      signal: AbortSignal.timeout(timeoutMs),
    })
    const location = response.headers.get("location")
    if (response.status >= 300 && response.status < 400 && location) {
      url = new URL(location, url)
      continue
    }
    if (Number(response.headers.get("content-length") ?? 0) > maxBytes) throw new Error("The response is too large.")
    const reader = response.body?.getReader()
    const chunks: Uint8Array[] = []
    let size = 0
    while (reader) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.length
      if (size > maxBytes) {
        await reader.cancel()
        throw new Error("The response is too large.")
      }
      chunks.push(value)
    }
    // Preserve CORS for browser-fetched scripts and APIs. Do not forward encoding
    // or length headers: fetch has already decompressed the response body.
    const headers = Object.fromEntries([...response.headers].filter(([name]) => name.startsWith("access-control-")))
    return { buffer: Buffer.concat(chunks), contentType: response.headers.get("content-type") ?? "", finalUrl: url.toString(), status: response.status, headers }
  }
  throw new Error("Too many redirects.")
}

/** Back-compat helper for image downloads: throws on non-2xx. */
export async function safeFetchBytes(rawUrl: string, maxBytes: number, accept = "image/*"): Promise<Buffer> {
  const result = await safeFetch(rawUrl, { maxBytes, accept })
  if (result.status >= 400) throw new Error(`The server answered ${result.status}.`)
  return result.buffer
}

export async function safeFetchText(rawUrl: string, maxBytes = 3 * 1024 * 1024) {
  const result = await safeFetch(rawUrl, { maxBytes, accept: "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.5" })
  return { ...result, text: result.buffer.toString("utf8") }
}
