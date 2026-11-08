import assert from "node:assert/strict"
import test from "node:test"
import { assertImageBudget } from "./image-budget"
test("image pixel and edge caps reject decompression-bomb dimensions", () => {
  for (const size of [null, { width: 10000, height: 10000 }, { width: 9000, height: 2 }, { width: 0, height: 1 }]) assert.throws(() => assertImageBudget(size))
  assert.doesNotThrow(() => assertImageBudget({ width: 2048, height: 2048 }))
})
