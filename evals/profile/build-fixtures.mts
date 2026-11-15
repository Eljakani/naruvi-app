/**
 * Builds the invented CVs used by the import evals (evals/profile/fixtures).
 * Every person is made up. Run: npx tsx evals/profile/build-fixtures.mts
 * Needs LibreOffice (`soffice`) for the DOCX files and the Writer-made PDFs, and poppler's `pdftoppm` for the scan;
 * the two-column PDFs come from @react-pdf/renderer.
 */
import { execFileSync } from "node:child_process"
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { createElement as h, type ComponentProps, type ReactNode } from "react"
import { Document, Image, Link, Page, Text, View, renderToFile } from "@react-pdf/renderer"

const out = join(import.meta.dirname, "fixtures")
mkdirSync(out, { recursive: true })
const work = mkdtempSync(join(tmpdir(), "cv-fixtures-"))

function office(html: string, name: string, format: "docx" | "pdf" | "png") {
  const source = join(work, `${name}.html`)
  writeFileSync(source, `<!doctype html><html><head><meta charset="utf-8"><style>body{font-family:'DejaVu Sans',sans-serif;font-size:10.5pt}h1{font-size:20pt;margin:0}h2{font-size:12pt;border-bottom:1px solid #999;margin:14pt 0 4pt}p{margin:2pt 0}td{vertical-align:top;padding:2pt 6pt}</style></head><body>${html}</body></html>`)
  const filter = format === "docx" ? "docx:MS Word 2007 XML" : "pdf:writer_web_pdf_Export"
  execFileSync("soffice", ["--headless", "--convert-to", filter, "--outdir", work, source], { stdio: "ignore" })
  if (format === "png") execFileSync("pdftoppm", ["-png", "-r", "50", "-singlefile", join(work, `${name}.pdf`), join(work, name)])
  else copyFileSync(join(work, `${name}.${format}`), join(out, `${name}.${format}`))
}

/* ------------------------------------------------------------------ 1. English, one column, Writer PDF */

office(`
<h1>Maya Okafor</h1>
<p>Senior Backend Engineer</p>
<p>Leeds, United Kingdom · maya.okafor@example.com · +44 7700 900123</p>
<p><a href="https://www.linkedin.com/in/maya-okafor-dev">LinkedIn</a> · <a href="https://github.com/mayaokafor">GitHub</a></p>
<h2>Summary</h2>
<p>Backend engineer with seven years of experience building payment and logistics systems in Go and Python.</p>
<h2>Experience</h2>
<p><b>Senior Backend Engineer</b> — Monzo, London, UK (Remote)<br>Mar 2021 – Present</p>
<ul><li>Led the migration of the ledger service to an event-sourced design handling 4 million transactions a day.</li>
<li>Cut p99 latency of the payments API from 480 ms to 120 ms by redesigning connection pooling.</li>
<li>Mentored 5 engineers and ran the weekly incident review.</li></ul>
<p><b>Backend Engineer</b> — Deliveroo, London<br>Jun 2018 – Feb 2021</p>
<ul><li>Built the rider payout pipeline in Python and Kafka, processing 900,000 payouts a week.</li>
<li>Introduced contract tests between 12 services, reducing integration incidents.</li></ul>
<p><b>Software Engineering Intern</b> — Arm, Cambridge<br>Jul 2017 – Sep 2017</p>
<ul><li>Wrote a benchmark harness in C for memory allocators.</li></ul>
<h2>Education</h2>
<p><b>BSc Computer Science</b>, University of Leeds — 2014 – 2018<br>First Class Honours</p>
<h2>Certifications</h2>
<p>AWS Certified Solutions Architect – Associate, Amazon Web Services — Issued May 2022 — Credential ID AWS-ASA-48213</p>
<p>Certified Kubernetes Administrator (CKA), The Linux Foundation — 2023</p>
<h2>Skills</h2>
<p><b>Languages:</b> Go, Python, SQL</p>
<p><b>Infrastructure:</b> Kubernetes, Terraform, AWS</p>
<p><b>Data:</b> PostgreSQL, Kafka, Redis</p>
<h2>Projects</h2>
<p><b>ledgerlite</b> — open-source double-entry ledger library in Go (2022)<br>https://github.com/mayaokafor/ledgerlite</p>
<ul><li>Published a library used by 3 fintech startups.</li></ul>
<h2>Languages</h2>
<p>English (native), French (B2), Yoruba (conversational)</p>
`, "en-classic", "pdf")

/* ------------------------------------------------------------------ 2. French, two columns (left sidebar), react-pdf */

type Style = Record<string, unknown>
const T = (style: Style, ...children: ReactNode[]) => h(Text, { style } as ComponentProps<typeof Text>, ...children)
const head = (text: string) => T({ fontSize: 11, fontFamily: "Helvetica-Bold", marginTop: 12, marginBottom: 4 }, text)
const line = (text: string, style: Record<string, unknown> = {}) => T({ fontSize: 9.5, marginBottom: 2, ...style }, text)
const bullet = (text: string) => line(`• ${text}`, { marginLeft: 8 })
const bold = { fontFamily: "Helvetica-Bold" }

await renderToFile(
  h(Document, {},
    h(Page, { size: "A4", style: { flexDirection: "row", fontFamily: "Helvetica" } },
      h(View, { style: { width: 180, backgroundColor: "#eef1f5", padding: 18 } },
        T({ fontSize: 18, ...bold }, "Julien Marchetti"),
        line("Chef de projet digital", { marginTop: 4 }),
        head("CONTACT"),
        line("Lyon, France"), line("julien.marchetti@example.fr"), line("06 12 34 56 78"),
        h(Link, { src: "https://www.linkedin.com/in/julien-marchetti-pm", style: { fontSize: 9.5 } }, "LinkedIn"),
        head("COMPÉTENCES"),
        line("Gestion de projet", bold), line("Agile, Scrum, Jira, Kanban"),
        line("Outils", { ...bold, marginTop: 4 }), line("Figma, Google Analytics, HubSpot"),
        head("LANGUES"),
        line("Français — langue maternelle"), line("Anglais — courant (TOEIC 945)"), line("Italien — notions"),
        head("CENTRES D'INTÉRÊT"),
        line("Trail, photographie argentique"),
      ),
      h(View, { style: { flex: 1, padding: 22 } },
        head("PROFIL"),
        line("Chef de projet digital avec 6 ans d'expérience dans le e-commerce et le conseil."),
        head("EXPÉRIENCES PROFESSIONNELLES"),
        line("Chef de projet digital", bold), line("Decathlon — Lille | 03/2022 – aujourd'hui"),
        bullet("Pilotage de la refonte du tunnel d'achat mobile, +14 % de conversion."),
        bullet("Coordination d'une équipe de 9 personnes (design, développement, data)."),
        line("Chargé de projet web", { ...bold, marginTop: 6 }), line("Capgemini — Lyon | sept. 2019 – févr. 2022"),
        bullet("Gestion de 4 projets clients dans la banque et l'assurance."),
        bullet("Mise en place des rituels Scrum pour 3 équipes."),
        line("Assistant chef de projet (stage)", { ...bold, marginTop: 6 }), line("Orange — Paris | janv. 2019 – juin 2019"),
        bullet("Suivi du planning et des livrables d'un portail intranet."),
        head("FORMATION"),
        line("Master Management de projets numériques", bold), line("emlyon business school — 2017 – 2019"),
        line("Licence Information-Communication", { ...bold, marginTop: 4 }), line("Université Lumière Lyon 2 — 2014 – 2017"),
        head("CERTIFICATIONS"),
        line("Professional Scrum Master I (PSM I) — Scrum.org — 2021"),
        line("Google Analytics Individual Qualification — Google — 2020"),
      ),
    ),
  ),
  join(out, "fr-two-column.pdf"),
)

/* ------------------------------------------------------------------ 3. Spanish, DOCX, unusual section titles */

office(`
<h1>Lucía Fernández Ortega</h1>
<p>Diseñadora UX · Valencia, España</p>
<p>lucia.fernandez@example.es | +34 600 123 456 | <a href="https://luciafernandez.example.es">luciafernandez.example.es</a></p>
<h2>Sobre mí</h2>
<p>Diseñadora de producto centrada en accesibilidad e investigación con usuarios.</p>
<h2>Trayectoria</h2>
<p><b>Diseñadora UX sénior</b>, Cabify (Madrid)</p>
<p>enero de 2020 – actualidad</p>
<ul><li>Rediseñé el flujo de reserva, reduciendo los abandonos un 18 %.</li><li>Creé el sistema de diseño usado por 6 equipos de producto.</li></ul>
<p><b>Diseñadora de interacción</b>, Glovo (Barcelona)</p>
<p>sept. 2016 – dic. 2019</p>
<ul><li>Realicé más de 120 entrevistas con usuarios y repartidores.</li></ul>
<h2>Estudios</h2>
<p><b>Grado en Diseño Industrial</b> — Universitat Politècnica de València, 2012 – 2016</p>
<h2>Lo que sé hacer</h2>
<p>Investigación: entrevistas, pruebas de usabilidad, encuestas</p>
<p>Herramientas: Figma, Maze, Miro</p>
<h2>Idiomas</h2>
<p>Español (nativo) · Inglés (C1, Cambridge Advanced) · Catalán (B2)</p>
<h2>Charlas y eventos</h2>
<p>«Diseñar para la accesibilidad» — ponente en UX Spain 2023, Santander, mayo de 2023</p>
<p>Ponente en Codemotion Madrid 2022: «Sistemas de diseño que sobreviven» (noviembre de 2022)</p>
`, "es-unusual", "docx")

/* ------------------------------------------------------------------ 4. English, two columns (right sidebar), unusual order, react-pdf */

await renderToFile(
  h(Document, {},
    h(Page, { size: "A4", style: { fontFamily: "Helvetica", padding: 26 } },
      T({ fontSize: 20, ...bold }, "Tomasz Wieczorek"),
      line("Data Scientist — Berlin, Germany", { marginTop: 3, marginBottom: 8 }),
      h(View, { style: { flexDirection: "row" } },
        h(View, { style: { flex: 1, paddingRight: 16 } },
          head("WHAT I DO BEST"),
          line("Machine learning: forecasting, gradient boosting, causal inference"),
          line("Engineering: Python, SQL, Spark, Airflow, dbt"),
          head("EDUCATION"),
          line("MSc Data Science — Technische Universität Berlin", bold), line("2017-10 → 2019-09 · Thesis on demand forecasting, grade 1.3"),
          line("BSc Mathematics — University of Warsaw", { ...bold, marginTop: 4 }), line("2014 → 2017"),
          head("CAREER"),
          line("Senior Data Scientist | Zalando SE | Berlin", bold), line("2021-01 → now"),
          bullet("Built the returns forecasting model used in 23 markets, cutting forecast error by 11%."),
          bullet("Led a team of 4 data scientists."),
          line("Data Scientist | N26 | Berlin", { ...bold, marginTop: 6 }), line("2019-10 → 2020-12"),
          bullet("Developed fraud features that blocked 2,300 fraudulent sign-ups a month."),
          head("TALKS & CONFERENCES"),
          line("“Forecasting returns at scale” — PyData Berlin 2023 (speaker)"),
          line("“Feature stores in practice” — Berlin Buzzwords, June 2022 (speaker)"),
          line("NeurIPS 2022, New Orleans (attendee)"),
        ),
        h(View, { style: { width: 170, paddingLeft: 14, borderLeft: "1px solid #999" } },
          head("CONTACT"),
          line("tomasz.wieczorek@example.org"), line("+49 151 2345 6789"),
          h(Link, { src: "https://github.com/twieczorek-data", style: { fontSize: 9.5 } }, "github.com/twieczorek-data"),
          head("LANGUAGES"),
          line("Polish — mother tongue"), line("German — C1 (Goethe-Zertifikat C1)"), line("English — C2"),
          head("CERTIFICATES"),
          line("Google Cloud Professional Data Engineer (2022)"),
          h(Link, { src: "https://www.credential.net/0f3c1a7e-invented", style: { fontSize: 8.5, marginBottom: 4 } }, "credential.net/0f3c1a7e-invented"),
          line("Deep Learning Specialization — DeepLearning.AI, Coursera, 2020"),
          head("OPEN SOURCE"),
          line("returnscast — forecasting toolkit"), line("github.com/twieczorek-data/returnscast"),
        ),
      ),
    ),
  ),
  join(out, "en-sidebar-right.pdf"),
)

/* ------------------------------------------------------------------ 5. German, DOCX, table layout (dates in the left column) */

const row = (left: string, right: string) => `<tr><td width="24%">${left}</td><td>${right}</td></tr>`
office(`
<h1>Lebenslauf</h1>
<table width="100%">
${row("Name", "Jonas Reinhardt")}
${row("Anschrift", "Lindwurmstraße 12, 80337 München")}
${row("E-Mail", "jonas.reinhardt@example.de")}
${row("Telefon", "+49 89 1234 5678")}
</table>
<h2>Berufserfahrung</h2>
<table width="100%">
${row("seit 04/2021", "<b>Entwicklungsingenieur</b><br>Siemens AG, München<br>- Auslegung von Getrieben für Schienenfahrzeuge<br>- Leitung eines Teilprojekts mit 6 Ingenieuren")}
${row("10/2017 – 03/2021", "<b>Konstrukteur</b><br>Robert Bosch GmbH, Stuttgart<br>- Konstruktion von Einspritzkomponenten in CATIA V5<br>- Reduzierung der Bauteilkosten um 8 %")}
</table>
<h2>Ausbildung</h2>
<table width="100%">
${row("10/2015 – 09/2017", "<b>M.Sc. Maschinenbau</b><br>RWTH Aachen<br>Abschlussnote 1,7")}
${row("10/2012 – 09/2015", "<b>B.Sc. Maschinenbau</b><br>Technische Universität München")}
</table>
<h2>Weiterbildung</h2>
<table width="100%">
${row("2020", "Six Sigma Green Belt, TÜV SÜD Akademie")}
</table>
<h2>Kenntnisse</h2>
<table width="100%">
${row("CAD", "CATIA V5, SolidWorks, Siemens NX")}
${row("Programmierung", "MATLAB, Python")}
</table>
<h2>Sprachen</h2>
<table width="100%">
${row("Deutsch", "Muttersprache")}
${row("Englisch", "verhandlungssicher")}
${row("Spanisch", "Grundkenntnisse")}
</table>
`, "de-table", "docx")

/* ------------------------------------------------------------------ 6. French student, Writer PDF, missing sections, two roles at one company */

office(`
<h1>Inès Belkacem</h1>
<p>Étudiante en droit des affaires — Bordeaux</p>
<p>ines.belkacem@example.fr — 07 55 55 01 23</p>
<h2>Parcours académique</h2>
<p><b>Master 1 Droit des affaires</b> — Université de Bordeaux — depuis septembre 2024</p>
<p><b>Licence de Droit</b> — Université de Bordeaux — 2021 – 2024 — mention Bien</p>
<p><b>Baccalauréat général</b>, mention Très Bien — Lycée Montaigne, Bordeaux — 2021</p>
<h2>Expériences</h2>
<p><b>Cabinet Fidal — Bordeaux</b></p>
<p>Stagiaire en droit des sociétés — été 2024</p>
<ul><li>Rédaction de 15 procès-verbaux d'assemblées générales.</li><li>Recherches juridiques sur les cessions de parts sociales.</li></ul>
<p>Assistante juridique (temps partiel) — octobre 2023 à mai 2024</p>
<ul><li>Mise à jour des registres légaux de 30 sociétés clientes.</li></ul>
<p><b>Vendeuse</b> — Fnac, Bordeaux — juillet 2022 – août 2022</p>
<ul><li>Conseil client au rayon livres.</li></ul>
<h2>Engagements</h2>
<p>Bénévole à la Clinique du droit de Bordeaux — depuis 2023 : permanences d'accès au droit pour les étudiants.</p>
<p>Trésorière de l'association des étudiants en droit (2022 – 2023)</p>
`, "fr-student", "pdf")

/* ------------------------------------------------------------------ 7. Arabic, DOCX */

const arabic = `<div dir="rtl" lang="ar">
<h1>سلمى العمراني</h1>
<p>مهندسة برمجيات — الدار البيضاء، المغرب</p>
<p>salma.elamrani@example.ma — ‎+212 600 112233</p>
<h2>الخبرة المهنية</h2>
<p><b>مهندسة برمجيات</b> — OCP Group، الدار البيضاء</p>
<p>يناير 2021 – حتى الآن</p>
<ul><li>تطوير منصة لتتبع الشحنات يستخدمها 400 موظف.</li><li>ترحيل 12 خدمة إلى Kubernetes.</li></ul>
<p><b>مطورة ويب</b> — Inwi، الرباط</p>
<p>2018 – 2020</p>
<ul><li>بناء واجهات بوابة العملاء باستخدام React.</li></ul>
<h2>التعليم</h2>
<p><b>دبلوم مهندس دولة في هندسة البرمجيات</b> — المدرسة الوطنية العليا للمعلوميات وتحليل النظم (ENSIAS)، الرباط — 2013 – 2018</p>
<h2>المهارات</h2>
<p>Java، Spring Boot، React، PostgreSQL، Kubernetes</p>
<h2>اللغات</h2>
<p>العربية (اللغة الأم)، الفرنسية (C1)، الإنجليزية (B2)</p>
</div>`
office(arabic, "ar-simple", "docx")
office(arabic, "ar-simple", "pdf")

/* ------------------------------------------------------------------ 8. A scan: a PDF with a picture of a CV and no text */

office(`<h1>Pat Example</h1><p>Scanned CV: there is no text layer in this file.</p><h2>Experience</h2><p>Clerk — Example Ltd — 2019 – 2022</p>`, "scan-source", "png")
await renderToFile(h(Document, {}, h(Page, { size: "A4" }, h(Image, { src: readFileSync(join(work, "scan-source.png")), style: { width: "100%" } }))), join(out, "scan-only.pdf"))

/* ------------------------------------------------------------------ 9. Design-tool export: blocks placed absolutely and written in no particular order */

type Block = { left: number; top: number; width: number; lines: [string, Record<string, unknown>?][] }
const spaced = (text: string) => text.split("").join(" ")
const side = 28, main = 215
const blocks: Block[] = [
  { left: side, top: 30, width: 160, lines: [["Noah Bergström", { fontSize: 17, ...bold }], ["Product Designer"]] },
  { left: side, top: 90, width: 160, lines: [[spaced("CONTACT"), bold], ["Gothenburg, Sweden"], ["noah.bergstrom@example.se"], ["+46 70 123 45 67"], ["noahbergstrom.example.se"]] },
  { left: side, top: 190, width: 160, lines: [[spaced("SKILLS"), bold], ["Design: Figma, Sketch, prototyping"], ["Research: user interviews, usability testing"], ["Front-end: HTML, CSS"]] },
  { left: side, top: 280, width: 160, lines: [[spaced("LANGUAGES"), bold], ["Swedish — Native"], ["English — Fluent"], ["Spanish — Basic"]] },
  { left: side, top: 360, width: 160, lines: [[spaced("CERTIFICATIONS"), bold], ["Google UX Design Certificate"], ["Coursera, 2019"], ["Certified Usability Analyst (CUA)"], ["Human Factors International, 2021"]] },
  { left: main, top: 30, width: 350, lines: [[spaced("EXPERIENCE"), bold]] },
  { left: main, top: 50, width: 350, lines: [["Lead Product Designer", bold], ["Klarna · Stockholm · Aug 2021 – Present"], ["• Redesigned the checkout for 45 million shoppers, lifting completion by 6%."], ["• Managed a team of 7 designers."]] },
  { left: main, top: 125, width: 350, lines: [["Product Designer", bold], ["Volvo Cars · Gothenburg · Jan 2018 – Jul 2021"], ["• Designed the in-car infotainment settings used in 4 car models."], ["• Ran 60 usability sessions with drivers."]] },
  { left: main, top: 200, width: 350, lines: [["Junior UX Designer", bold], ["IKEA · Älmhult · Jun 2016 – Dec 2017"], ["• Built wireframes for the kitchen planner."]] },
  { left: main, top: 265, width: 350, lines: [[spaced("EDUCATION"), bold]] },
  { left: main, top: 285, width: 350, lines: [["MSc Interaction Design", bold], ["Chalmers University of Technology · 2014 – 2016"]] },
  { left: main, top: 320, width: 350, lines: [["BA Graphic Design", bold], ["University of Gothenburg · 2011 – 2014"]] },
  { left: main, top: 370, width: 350, lines: [[spaced("SPEAKING"), bold], ["“Designing checkout for trust” — Config 2023, San Francisco"]] },
]
// A fixed shuffle: the reading order on the page is nothing like the order in the file.
const order = [7, 3, 11, 0, 9, 6, 4, 12, 1, 8, 5, 10, 2]
await renderToFile(
  h(Document, {}, h(Page, { size: "A4", style: { fontFamily: "Helvetica" } },
    ...order.map((index) => { const block = blocks[index]; return h(View, { key: index, style: { position: "absolute", left: block.left, top: block.top, width: block.width } }, ...block.lines.map(([text, style]) => line(text, style))) }),
  )),
  join(out, "en-shuffled.pdf"),
)

/* ------------------------------------------------------------------ 9b. The same CV as a two-column table: each row of the file holds a sidebar line and a main line */

const column = (left: number) => blocks.filter((block) => block.left === left).flatMap((block) => [...block.lines, ["", {}] as [string, Record<string, unknown>?]])
const leftLines = column(side), rightLines = column(main)
await renderToFile(
  h(Document, {}, h(Page, { size: "A4", style: { fontFamily: "Helvetica", padding: 28 } },
    ...Array.from({ length: Math.max(leftLines.length, rightLines.length) }, (_, index) => h(View, { key: index, style: { flexDirection: "row", minHeight: 13 } },
      h(View, { style: { width: 175, paddingRight: 16 } }, leftLines[index]?.[0] ? line(leftLines[index][0], leftLines[index][1]) : null),
      h(View, { style: { flex: 1 } }, rightLines[index]?.[0] ? line(rightLines[index][0], rightLines[index][1]) : null),
    )),
  )),
  join(out, "en-interleaved.pdf"),
)

/* ------------------------------------------------------------------ 10. Long CV: three pages, page headers and footers, forty entries */

const jobs = [
  ["Staff Research Engineer", "DeepMind", "London", "Feb 2022 – Present", "2022-02", "present"],
  ["Senior Research Engineer", "Spotify", "Stockholm", "Sep 2019 – Jan 2022", "2019-09", "2022-01"],
  ["Research Engineer", "Criteo", "Paris", "Jan 2017 – Aug 2019", "2017-01", "2019-08"],
  ["Machine Learning Engineer", "Booking.com", "Amsterdam", "Mar 2015 – Dec 2016", "2015-03", "2016-12"],
  ["Software Engineer", "SAP", "Walldorf", "Jul 2013 – Feb 2015", "2013-07", "2015-02"],
  ["Visiting Researcher", "Inria", "Grenoble", "Jan 2013 – Jun 2013", "2013-01", "2013-06"],
  ["Teaching Assistant", "EPFL", "Lausanne", "Sep 2011 – Dec 2012", "2011-09", "2012-12"],
  ["Research Intern", "IBM Research", "Zurich", "Jun 2011 – Aug 2011", "2011-06", "2011-08"],
  ["Software Engineering Intern", "Infosys", "Bangalore", "May 2010 – Jul 2010", "2010-05", "2010-07"],
  ["Freelance Web Developer", "Self-employed", "Chennai", "2008 – 2010", "2008", "2010"],
]
const duties = ["Shipped a ranking model serving %d million requests a day.", "Reduced training cost by %d% through mixed-precision training.", "Mentored %d junior engineers across two teams.", "Wrote %d internal design documents adopted by the organisation."]
const schools = [["PhD Computer Science", "EPFL", "2011 – 2015", "2011", "2015"], ["MSc Computer Science", "Indian Institute of Technology Madras", "2009 – 2011", "2009", "2011"], ["BTech Information Technology", "Anna University", "2005 – 2009", "2005", "2009"]]
const certs = [["Google Cloud Professional Machine Learning Engineer", "Google Cloud", "2023"], ["AWS Certified Machine Learning – Specialty", "Amazon Web Services", "2021"], ["TensorFlow Developer Certificate", "Google", "2020"], ["Certified Kubernetes Application Developer (CKAD)", "The Linux Foundation", "2019"], ["Databricks Certified Data Engineer Associate", "Databricks", "2022"], ["Professional Scrum Master I", "Scrum.org", "2018"]]
const talks = [["Ranking at a billion scale", "NeurIPS 2023", "New Orleans"], ["Lessons from podcast recommendations", "RecSys 2021", "Amsterdam"], ["Counterfactual evaluation in practice", "KDD 2019", "Anchorage"], ["Scaling feature pipelines", "Spark + AI Summit 2018", "San Francisco"], ["Bandits for hotel ranking", "ICML 2016", "New York"], ["Teaching machine learning to engineers", "EuroPython 2014", "Berlin"]]
const works = [["rankkit", "open-source learning-to-rank library", "https://github.com/priyaraman-ml/rankkit"], ["podflow", "podcast embedding pipeline", "https://github.com/priyaraman-ml/podflow"], ["cfeval", "counterfactual evaluation toolkit", "https://github.com/priyaraman-ml/cfeval"], ["tamil-nlp", "Tamil tokenizer and corpus tools", "https://github.com/priyaraman-ml/tamil-nlp"]]
const prizes = [["Best Paper Award", "RecSys", "2021"], ["Google PhD Fellowship", "Google", "2013"], ["Institute Silver Medal", "IIT Madras", "2011"]]
const groups = [["Machine learning", ["PyTorch", "JAX", "XGBoost", "learning to rank"]], ["Data", ["Spark", "Beam", "BigQuery", "Airflow"]], ["Languages", ["Python", "Scala", "C++"]], ["Leadership", ["mentoring", "technical roadmaps"]]] as const
const spoken = [["Tamil", "native", "native"], ["English", "C2", "C2"], ["French", "B2 (DELF B2)", "B2"], ["German", "A2", "A2"]]

let n = 3
const longHtml = `
<h1>Priya Raman</h1>
<p>Staff Research Engineer — recommender systems</p>
<p>London, United Kingdom | priya.raman@example.org | +44 20 7946 0321 | https://github.com/priyaraman-ml</p>
<h2>Professional Experience</h2>
${jobs.map(([title, company, city, when], index) => `<p><b>${title}</b>, ${company} — ${city}<br><i>${when}</i></p><ul>${duties.map((duty) => `<li>${duty.replace("%d", String((n += 7 + index)))}</li>`).join("")}</ul>`).join("")}
<h2>Education</h2>
${schools.map(([degree, school, when]) => `<p><b>${degree}</b> — ${school} (${when})</p>`).join("")}
<h2>Licenses &amp; Certifications</h2>
${certs.map(([name, issuer, year]) => `<p>${name} — ${issuer}, ${year}</p>`).join("")}
<h2>Invited Talks</h2>
${talks.map(([title, event, city]) => `<p>“${title}”, ${event}, ${city}</p>`).join("")}
<h2>Open-Source Projects</h2>
${works.map(([name, what, url]) => `<p><b>${name}</b> — ${what}. ${url}</p>`).join("")}
<h2>Honours</h2>
${prizes.map(([title, by, year]) => `<p>${title}, ${by} (${year})</p>`).join("")}
<h2>Technical Skills</h2>
${groups.map(([name, items]) => `<p><b>${name}:</b> ${items.join(", ")}</p>`).join("")}
<h2>Languages</h2>
${spoken.map(([name, level]) => `<p>${name}: ${level}</p>`).join("")}
`
office(`<div title="header"><p style="font-size:8pt;color:#666">Priya Raman — Curriculum Vitae</p></div><div title="footer"><p style="font-size:8pt;color:#666">Curriculum Vitae · priya.raman@example.org</p></div>${longHtml}`, "en-long", "pdf")
writeFileSync(join(import.meta.dirname, "expected-long.json"), JSON.stringify({ "en-long.pdf": {
  language: "en",
  identity: { fullName: "Priya Raman", headline: "Staff Research Engineer", email: "priya.raman@example.org", phone: "+44 20 7946 0321", location: "London", links: ["github.com/priyaraman-ml"] },
  entries: [
    ...jobs.map(([name, org, location, , start, end]) => ({ kind: "experience", name, org, start, end, location, bullets: 4 })),
    ...schools.map(([name, org, , start, end]) => ({ kind: "education", name, org, start, end })),
    ...certs.map(([name, org, start]) => ({ kind: "certification", name: name.replace(/ \(.*/, ""), org, start })),
    ...talks.map(([name, org, location]) => ({ kind: "event", name, org: org.replace(/ \d{4}$/, ""), start: org.match(/\d{4}/)![0], location })),
    ...works.map(([name, , url]) => ({ kind: "project", name, url: url.replace("https://", "") })),
    ...prizes.map(([name, org, start]) => ({ kind: "achievement", name, org, start })),
    ...groups.map(([name, skills]) => ({ kind: "skill", name, skills })),
    ...spoken.map(([name, , level]) => ({ kind: "language", name, level })),
  ],
} }, null, 1) + "\n")

console.log("fixtures written to", out)
