import assert from "node:assert/strict"
import test from "node:test"
import { likePattern, prefixQuery } from "./search"

test("search terms become safe prefix queries in any script", () => {
  assert.equal(prefixQuery("Cloud secu"), "cloud:* & secu:*")
  assert.equal(prefixQuery("  ingénieur   DevSecOps! "), "ingénieur:* & devsecops:*")
  assert.equal(prefixQuery("مهندس أمن"), "مهندس:* & أمن:*")
  assert.equal(prefixQuery("a' & b | !c:*"), "a:* & b:* & c:*")
  assert.equal(prefixQuery("  ---  "), null)
})

test("like patterns escape wildcards", () => {
  assert.equal(likePattern("100%_ok"), "%100\\%\\_ok%")
})
