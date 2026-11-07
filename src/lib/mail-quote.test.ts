import { test } from "node:test"
import assert from "node:assert/strict"
import { splitQuoted } from "./mail-quote"

test("French Gmail quote on its own line", () => {
  const { body, quoted } = splitQuoted("Merci, à lundi.\n\nLe sam. 7 nov. 2026 à 06:18, Alex <y@x.com> a écrit :\n> Bonjour")
  assert.equal(body, "Merci, à lundi.")
  assert.match(quoted, /^Le sam\./)
})

test("French quote inline after the text", () => {
  const { body } = splitQuoted("After the interview we decided to give you the job Le sam. 7 nov. 2026 à 06:18, Alex Martin <a@b.com> a écrit : Hi")
  assert.equal(body, "After the interview we decided to give you the job")
})

test("French quote where a écrit wraps onto the next line", () => {
  const { body } = splitQuoted("After the interview we decided to give you the job\n\nLe sam. 7 nov. 2026 à 06:18, Alex Martin <alex.martin@orange.fr>\na écrit :\n> Hi")
  assert.equal(body, "After the interview we decided to give you the job")
})

test("English quote", () => {
  const { body, quoted } = splitQuoted("Thanks!\n\nOn Mon, Nov 2, 2026 at 9:00 AM Jane <j@x.com> wrote:\n> Hello")
  assert.equal(body, "Thanks!")
  assert.ok(quoted.startsWith("On Mon"))
})

test("plain > quoting and Outlook headers", () => {
  assert.equal(splitQuoted("Sounds good.\n> line one\n> line two").body, "Sounds good.")
  assert.equal(splitQuoted("See below.\nFrom: HR <hr@x.com>\nSent: Monday\nSubject: Hi").body, "See below.")
})

test("no quote, or only a quote, keeps everything", () => {
  assert.deepEqual(splitQuoted("Just a message."), { body: "Just a message.", quoted: "" })
  assert.equal(splitQuoted("> only quoted\n> text").body, "> only quoted\n> text")
})
