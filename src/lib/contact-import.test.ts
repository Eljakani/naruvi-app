import assert from "node:assert/strict"
import test from "node:test"
import { contactsFromRows, mapHeaders } from "./contact-import"

test("LinkedIn's Connections export maps without any setup", () => {
  const { contacts } = contactsFromRows([
    { "First Name": "Camille", "Last Name": "Durand", URL: "https://www.linkedin.com/in/camille-durand-123/", "Email Address": "", Company: "Dashlane", Position: "Talent Acquisition Partner", "Connected On": "05 Nov 2026" },
  ])
  assert.deepEqual(contacts, [{ name: "Camille Durand", title: "Talent Acquisition Partner", companyName: "Dashlane", email: "", linkedinUrl: "https://www.linkedin.com/in/camille-durand-123", phone: "", notes: "" }])
})

test("French spreadsheets work too, and bad rows are skipped", () => {
  assert.deepEqual(Object.keys(mapHeaders(["Prénom", "Nom", "Société", "Poste", "E-mail", "Téléphone"])).sort(), ["companyName", "email", "first", "last", "phone", "title"])
  const result = contactsFromRows([
    { Nom: "Martin", Prénom: "Léa", Société: "Delia", "E-mail": "LEA@delia.fr", Poste: "RH" },
    { Nom: "", Prénom: "", Société: "Nobody" },
    { Nom: "Martin", Prénom: "Léa", Société: "Delia", "E-mail": "lea@delia.fr", Poste: "RH" },
    { Nom: "Bad", Prénom: "Mail", "E-mail": "not-an-email" },
  ])
  assert.equal(result.contacts.length, 2)
  assert.equal(result.contacts[0].email, "lea@delia.fr")
  assert.equal(result.contacts[1].email, "")
  assert.equal(result.skipped, 2)
})
