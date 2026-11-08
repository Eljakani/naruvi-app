import test from "node:test"
import assert from "node:assert/strict"
import { authDestination } from "./auth-navigation"

test("post-login destinations stay in application pages", () => {
  assert.equal(authDestination("/applications?view=board"), "/applications?view=board")
  for (const unsafe of ["https://evil.example", "//evil.example", "/\\evil.example", "/%2f%2fevil.example", "/%5cevil.example", "/login", "/auth/setup?token=secret", "/api/export", "/_next/static", "/%6cogin", "/../login", "/%00", "not-a-path", ""]) assert.equal(authDestination(unsafe), "/", unsafe)
})
