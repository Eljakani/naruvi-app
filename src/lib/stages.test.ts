import assert from "node:assert/strict"
import { test } from "node:test"
import { automaticStatus, columnOf, statusForColumn } from "./stages"

test("automation never pulls a sent application back", () => {
  assert.equal(automaticStatus("submitted", "generated"), "submitted")
  assert.equal(automaticStatus("interviewing", "analyzed"), "interviewing")
  assert.equal(automaticStatus("rejected", "ready"), "rejected")
  assert.equal(automaticStatus("analyzed", "ready"), "ready")
  assert.equal(automaticStatus("ready", "analyzed"), "analyzed")
})

test("columns map statuses and keep a status that already fits", () => {
  assert.equal(columnOf("ready"), "documents")
  assert.equal(columnOf("withdrawn"), "closed")
  assert.equal(statusForColumn("analyzed", "sent"), "submitted")
  assert.equal(statusForColumn("withdrawn", "closed"), "withdrawn")
  assert.equal(statusForColumn("ready", "documents"), "ready")
  assert.equal(statusForColumn("submitted", "documents"), "generated")
})
