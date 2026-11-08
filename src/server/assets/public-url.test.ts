import { test } from "node:test"
import assert from "node:assert/strict"
import { privateAddress, resolvePublicAddress } from "./public-url"

test("private, mapped and transition addresses are rejected", () => {
  for (const ip of ["127.0.0.1", "10.1.1.1", "169.254.169.254", "192.168.1.1", "100.64.1.1", "::1", "fc00::1", "fe80::1", "::ffff:127.0.0.1", "::ffff:7f00:1", "2002:7f00:1::", "2001:db8::1"]) assert.equal(privateAddress(ip), true, ip)
  for (const ip of ["8.8.8.8", "93.184.216.34", "2606:4700:4700::1111", "2001:4860:4860::8888"]) assert.equal(privateAddress(ip), false, ip)
})
test("public DNS is resolved once, and mixed public/private answers fail closed", async () => {
  let calls = 0
  const resolver = (async () => { calls++; return [{ address: "93.184.216.34", family: 4 }] }) as import("./public-url").PublicResolver
  const address = await resolvePublicAddress(new URL("https://example.com"), resolver)
  assert.equal(calls, 1)
  assert.equal(address.address, "93.184.216.34")
  const mixed = (async () => [{ address: "93.184.216.34", family: 4 }, { address: "10.0.0.1", family: 4 }]) as typeof resolver
  await assert.rejects(resolvePublicAddress(new URL("https://example.com"), mixed))
  await assert.rejects(resolvePublicAddress(new URL("http://user:password@example.com"), resolver))
  await assert.rejects(resolvePublicAddress(new URL("http://127.0.0.1"), resolver))
})
