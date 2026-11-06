import assert from "node:assert/strict"
import test from "node:test"
import { cell, toCsv } from "./csv"

test("cells are quoted when needed and formulas neutralised", () => {
  assert.equal(cell('Acme, "Inc"'), '"Acme, ""Inc"""')
  assert.equal(cell("=HYPERLINK(\"http://x\")"), `"'=HYPERLINK(""http://x"")"`)
  assert.equal(cell("-5% budget"), "'-5% budget")
  assert.equal(cell(-5), "-5")
  assert.equal(cell(new Date(Date.UTC(2026, 10, 6))), "2026-11-06")
  assert.equal(cell(null), "")
})

test("files start with a BOM and use CRLF", () => {
  const text = toCsv(["A", "B"], [["é", 1]])
  assert.ok(text.startsWith("﻿A,B\r\né,1\r\n"))
})
