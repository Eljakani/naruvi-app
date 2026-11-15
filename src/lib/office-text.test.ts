import assert from "node:assert/strict"
import { test } from "node:test"
import { docxText, odtText } from "./office-text"

const p = (text: string, extra = "") => `<w:p>${extra}<w:r><w:t xml:space="preserve">${text}</w:t></w:r></w:p>`
const cell = (...paragraphs: string[]) => `<w:tc>${paragraphs.join("")}</w:tc>`
const doc = (body: string) => `<?xml version="1.0"?><w:document xmlns:w="w"><w:body>${body}</w:body></w:document>`

test("docx: paragraphs, bullets, tabs, line breaks and entities", () => {
  const xml = doc(`${p("Ana Silva")}<w:p><w:pPr><w:numPr/></w:pPr><w:r><w:t>Cut costs by 12 %</w:t></w:r></w:p><w:p><w:r><w:t>Engineer</w:t><w:tab/><w:t>2019 &#8211; 2021</w:t><w:br/><w:t>R&amp;D</w:t></w:r></w:p>`)
  assert.deepEqual(docxText({ "word/document.xml": xml }).lines, ["Ana Silva", "• Cut costs by 12 %", "Engineer   2019 – 2021", "R&D"])
})

test("docx: a date column stays beside its job; a two-cell page layout is read cell by cell", () => {
  const dates = doc(`<w:tbl><w:tr>${cell(p("seit 04/2021"))}${cell(p("Entwicklungsingenieur"), p("Siemens AG, München"))}</w:tr><w:tr>${cell(p("2020"))}${cell(p("Six Sigma Green Belt"))}</w:tr></w:tbl>`)
  assert.deepEqual(docxText({ "word/document.xml": dates }).lines, ["seit 04/2021   Entwicklungsingenieur", "Siemens AG, München", "2020   Six Sigma Green Belt"])
  const layout = doc(`<w:tbl><w:tr>${cell(p("Contact"), p("ana@example.org"))}${cell(p("Experience"), p("Engineer, Monzo"))}</w:tr></w:tbl>`)
  assert.deepEqual(docxText({ "word/document.xml": layout }).lines, ["Contact", "ana@example.org", "", "Experience", "Engineer, Monzo"])
})

test("docx: text boxes are read once, deleted text is not, headers come first, links keep their address", () => {
  const box = `<w:p><w:r><mc:AlternateContent><mc:Choice><w:txbxContent>${p("Skills: Go, SQL")}</w:txbxContent></mc:Choice><mc:Fallback><w:txbxContent>${p("Skills: Go, SQL")}</w:txbxContent></mc:Fallback></mc:AlternateContent></w:r></w:p>`
  const link = `<w:p><w:hyperlink r:id="rId7"><w:r><w:t>LinkedIn</w:t></w:r></w:hyperlink><w:del><w:r><w:delText>old phone</w:delText></w:r></w:del></w:p>`
  const result = docxText({
    "word/document.xml": doc(`${p("Ana Silva")}${box}${link}`),
    "word/header1.xml": doc(p("ana.silva@example.org · +44 7700 900123")),
    "word/_rels/document.xml.rels": `<Relationships><Relationship Id="rId7" Target="https://www.linkedin.com/in/ana-silva-dev" TargetMode="External"/></Relationships>`,
  })
  assert.deepEqual(result.lines, ["ana.silva@example.org · +44 7700 900123", "", "Ana Silva", "Skills: Go, SQL", "", "LinkedIn"])
  assert.deepEqual(result.links, [{ text: "LinkedIn", url: "https://www.linkedin.com/in/ana-silva-dev" }])
})

test("odt: headings, paragraphs, tables and links", () => {
  const xml = `<office:document-content><office:body><office:text><text:h>Experience</text:h><text:p>Engineer<text:tab/>2019<text:line-break/>Monzo <text:a xlink:href="https://example.org/me">site</text:a></text:p><table:table><table:table-row><table:table-cell><text:p>Deutsch</text:p></table:table-cell><table:table-cell><text:p>Muttersprache</text:p></table:table-cell></table:table-row></table:table></office:text></office:body></office:document-content>`
  const result = odtText({ "content.xml": xml })
  assert.deepEqual(result.lines, ["Experience", "Engineer   2019", "Monzo site", "", "Deutsch   Muttersprache"])
  assert.deepEqual(result.links, [{ text: "site", url: "https://example.org/me" }])
})
