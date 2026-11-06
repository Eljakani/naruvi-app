import assert from "node:assert/strict"
import test from "node:test"
import { readProfileText } from "../ai-profile"

const pasted = `Camille Durand
She/Her
Talent Acquisition Lead at Dashlane
Paris, Île-de-France · Contact info
500+ connections`

test("profile reader keeps values found in the pasted text and drops invented ones", async () => {
  const guess = await readProfileText(pasted, async () => ({ text: JSON.stringify({ name: "Camille Durand", title: "Talent Acquisition Lead", companyName: "Doctolib" }), model: "test" }) as never)
  assert.deepEqual(guess, { name: "Camille Durand", title: "Talent Acquisition Lead", companyName: "" })
})
