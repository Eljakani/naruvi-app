import assert from "node:assert/strict"
import { test } from "node:test"
import { cleanLines, dropRunningLines, layoutPage, type TextRun } from "./pdf-layout"

const run = (str: string, x: number, y: number, width = str.length * 5): TextRun => ({ str, x, y, width, height: 10 })

test("pdf layout: a sidebar and a main column are read one after the other, whatever the order in the file", () => {
  const left = ["CONTACT", "Lyon, France", "ana.silva@example.org", "Agile, Scrum, Jira, Kanban", "Figma, Google Analytics", "Trail, photographie", "Français — langue maternelle", "Anglais — courant"]
  const right = ["EXPERIENCE", "Chef de projet digital, Decathlon", "Pilotage de la refonte du tunnel d'achat mobile", "Coordination d'une équipe de 9 personnes", "Chargé de projet web, Capgemini", "Gestion de 4 projets clients dans la banque", "Master Management de projets", "emlyon business school — 2017 – 2019"]
  // The file stores each row of the page: a sidebar line, then the main line beside it.
  const runs = left.flatMap((text, index) => [run(text, 30, 800 - index * 13), run(right[index], 220, 800 - index * 13)])
  const page = layoutPage(runs.reverse(), 595)
  assert.equal(page.columns, true)
  assert.deepEqual(page.lines.filter(Boolean), [...left, ...right])
})

test("pdf layout: a column of dates stays beside the text it dates", () => {
  const rows: [string, string][] = [["seit 04/2021", "Entwicklungsingenieur, Siemens AG"], ["10/2017 – 03/2021", "Konstrukteur, Robert Bosch GmbH"], ["10/2015 – 09/2017", "M.Sc. Maschinenbau, RWTH Aachen"], ["10/2012 – 09/2015", "B.Sc. Maschinenbau, TU München"], ["2020", "Six Sigma Green Belt, TÜV SÜD"]]
  const runs = rows.flatMap(([date, text], index) => [run(date, 40, 700 - index * 30), run(text, 200, 700 - index * 30)])
  const page = layoutPage(runs, 595)
  assert.equal(page.columns, false)
  assert.deepEqual(page.lines.filter(Boolean), rows.map(([date, text]) => `${date}   ${text}`))
})

test("pdf layout: a right-to-left page is read from the right, Latin words keep their order", () => {
  // Visual order, left to right: "." "React" "باستخدام" "واجهات" "بناء"
  const runs = [run(".", 100, 500, 3), run("React", 104, 500, 28), run("باستخدام", 136, 500, 40), run("واجهات", 180, 500, 30), run("بناء", 214, 500, 20), run("مطورة ويب", 200, 520, 45), run("Spring", 100, 480, 30), run("Boot", 134, 480, 22)]
  assert.deepEqual(layoutPage(runs, 595).lines.filter(Boolean), ["مطورة ويب", "بناء واجهات باستخدام React.", "Spring Boot"])
})

test("pdf cleanup: letter-spaced titles, hyphenated wraps, bullet glyphs, reversed Arabic ligatures", () => {
  assert.deepEqual(cleanLines(["E X P E R I E N C E", "E D U C AT I O N", "▪ Research: usability test-", "ing with drivers", "•", "Led a team", "حتى اآلن", "Go, Python"]), ["EXPERIENCE", "EDUCATION", "• Research: usability testing with drivers", "• Led a team", "حتى الآن", "Go, Python"])
})

test("pdf cleanup: running headers, footers and page numbers are dropped, the first page keeps its header", () => {
  const pages = [["Ana Silva — CV", "Experience", "Engineer at Monzo", "Page 1 of 2"], ["Ana Silva — CV", "Education", "BSc, Leeds", "Page 2 of 2"]]
  assert.deepEqual(dropRunningLines(pages), [["Ana Silva — CV", "Experience", "Engineer at Monzo"], ["Education", "BSc, Leeds"]])
})
