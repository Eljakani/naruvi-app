import { lookup } from "node:dns/promises"
import { isIP } from "node:net"

export function privateAddress(address: string): boolean {
  if (isIP(address) === 6) {
    const a = new URL(`http://[${address}]`).hostname.slice(1, -1).toLowerCase()
    if (a.startsWith("::ffff:")) {
      const [hi, lo] = a.slice(7).split(":").map(v => parseInt(v, 16))
      return privateAddress(`${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`)
    }
    // Only global unicast; exclude documentation and transition ranges too.
    return !/^[23]/.test(a) || (/^2001:(?:db8:|2:|10:|20:|0:|:)/.test(a)) || a.startsWith("2002:") || a.startsWith("3fff:")
  }
  if (isIP(address) !== 4) return true
  const [a, b, c] = address.split(".").map(Number)
  return a === 0 || a === 10 || a === 127 || a >= 224 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && (b === 168 || b === 0 && [0,2].includes(c))) || (a === 100 && b >= 64 && b <= 127) || (a === 198 && ([18,19].includes(b) || b === 51 && c === 100)) || (a === 203 && b === 0 && c === 113)
}
export type PublicResolver = (hostname: string, options: { all: true }) => Promise<import("node:dns").LookupAddress[]>
export async function resolvePublicAddress(url: URL, resolver: PublicResolver = lookup) {
  if (!/^https?:$/.test(url.protocol) || url.username || url.password) throw new Error("Only credential-free HTTP(S) URLs are allowed.")
  if (!["", "80", "443", "8080", "8443"].includes(url.port)) throw new Error("Only standard HTTP(S) ports are allowed.")
  const host = url.hostname.replace(/^\[|\]$/g, "")
  const family = isIP(host)
  const addresses = family ? [{ address: host, family }] : await resolver(host, { all: true })
  if (!addresses.length || addresses.some(a => privateAddress(a.address))) throw new Error("That address is local, private or reserved and is not allowed.")
  return addresses[0]
}
