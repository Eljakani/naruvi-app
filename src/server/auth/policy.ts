import { isIP } from "node:net"

/** Forwarded headers never select the trusted public origin. */
export function authOrigin(request: Pick<Request, "url">) {
  const url = new URL(process.env.NARUVI_URL || request.url)
  if (!process.env.NARUVI_URL && !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) throw new Error("Set NARUVI_URL before exposing authentication")
  if (url.username || url.password || !["http:", "https:"].includes(url.protocol)) throw new Error("Invalid NARUVI_URL")
  if (url.protocol !== "https:" && !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) throw new Error("Public authentication requires HTTPS and NARUVI_URL")
  return url.origin
}
export function sameOrigin(request: Pick<Request, "url" | "headers">) {
  return request.headers.get("origin") === authOrigin(request) && !["cross-site", "same-site"].includes(request.headers.get("sec-fetch-site") || "")
}
export function cookieName(kind: "session" | "setup", origin: string) {
  return `${origin.startsWith("https:") ? "__Host-" : ""}naruvi_${kind}`
}
export function clientBucket(request: Pick<Request, "headers">) {
  // Only enable behind a private app port and a gateway which overwrites this header.
  const address = process.env.NARUVI_TRUST_PROXY === "on" ? request.headers.get("x-naruvi-client-ip") || "" : ""
  return isIP(address) ? address : "untrusted"
}
