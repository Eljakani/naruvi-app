import "server-only"
import { lookup } from "node:dns/promises"
import { isIP } from "node:net"

function privateAddress(address: string) {
  if (isIP(address) === 6) {
    const a = address.toLowerCase()
    if (a.startsWith("::ffff:")) return privateAddress(a.slice(7))
    return a === "::1" || a === "::" || a.startsWith("fc") || a.startsWith("fd") || a.startsWith("fe80")
  }
  const [a, b] = address.split(".").map(Number)
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224
}

/** Fetch a public http(s) URL only; every redirect hop is re-checked. Size-capped. */
export async function safeFetchBytes(rawUrl: string, maxBytes: number, accept = "image/*"): Promise<Buffer> {
  let url = new URL(rawUrl)
  for (let hop = 0; hop < 5; hop += 1) {
    if (!/^https?:$/.test(url.protocol)) throw new Error("Only http(s) URLs are allowed.")
    const addresses = isIP(url.hostname) ? [{ address: url.hostname }] : await lookup(url.hostname, { all: true })
    if (!addresses.length || addresses.some((item) => privateAddress(item.address))) throw new Error("That address is local or private and is not allowed.")
    const response = await fetch(url, { redirect: "manual", headers: { accept, "user-agent": "CareerBuddy/0.1 (+local)" }, signal: AbortSignal.timeout(15_000) })
    if (response.status >= 300 && response.status < 400 && response.headers.get("location")) {
      url = new URL(response.headers.get("location")!, url)
      continue
    }
    if (!response.ok) throw new Error(`The server answered ${response.status}.`)
    if (Number(response.headers.get("content-length") ?? 0) > maxBytes) throw new Error("The file is too large.")
    const reader = response.body?.getReader()
    const chunks: Uint8Array[] = []
    let size = 0
    while (reader) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.length
      if (size > maxBytes) {
        await reader.cancel()
        throw new Error("The file is too large.")
      }
      chunks.push(value)
    }
    return Buffer.concat(chunks)
  }
  throw new Error("Too many redirects.")
}
