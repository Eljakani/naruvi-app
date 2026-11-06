import assert from "node:assert/strict"
import test from "node:test"
import { dueIn, dueLabel, needsAttention, type AttentionInput } from "./attention"

const now = new Date(2026, 10, 6, 10).getTime()
const day = 86_400_000
const item = (patch: Partial<AttentionInput>): AttentionInput => ({ id: "a", title: "Engineer", company: "Acme", logoPath: null, status: "analyzed", fit: 50, nextStep: "", nextStepDue: null, since: new Date(now), archived: false, ...patch })

test("due labels read naturally", () => {
  assert.equal(dueLabel(dueIn(0, now), now), "today")
  assert.equal(dueLabel(dueIn(1, now), now), "tomorrow")
  assert.equal(dueLabel(dueIn(3, now), now), "in 3 days")
  assert.equal(dueLabel(dueIn(-1, now), now), "1 day overdue")
  assert.equal(dueLabel(dueIn(-4, now), now), "4 days overdue")
})

test("overdue next steps come first, then ready documents, quiet applications and idle strong fits", () => {
  const list = needsAttention([
    item({ id: "idle", status: "analyzed", fit: 82, since: new Date(now - 5 * day) }),
    item({ id: "quiet", status: "submitted", since: new Date(now - 20 * day) }),
    item({ id: "ready", status: "ready", since: new Date(now - 2 * day) }),
    item({ id: "due", status: "submitted", nextStep: "Call back", nextStepDue: dueIn(-2, now) }),
    item({ id: "weak", status: "analyzed", fit: 40, since: new Date(now - 9 * day) }),
  ], now)
  assert.deepEqual(list.map((entry) => entry.id), ["due", "ready", "quiet", "idle"])
  assert.match(list[0].message, /Call back · 2 days overdue/)
})

test("archived, closed and later-dated applications stay out of the list", () => {
  const list = needsAttention([
    item({ id: "archived", status: "ready", archived: true }),
    item({ id: "closed", status: "rejected", nextStepDue: dueIn(-1, now) }),
    item({ id: "later", status: "ready", nextStepDue: dueIn(10, now) }),
  ], now)
  assert.deepEqual(list, [])
})
