/**
 * Splits a CV's text into its sections by recognising section titles in
 * English, French, Spanish, German, Italian, Portuguese, Dutch and Arabic.
 * Pure. Used to cut long CVs into parts, to tell titles from content, and by
 * the reader that works without a model.
 */

export type SectionKind = "summary" | "experience" | "education" | "skill" | "language" | "certification" | "project" | "event" | "achievement" | "publication" | "volunteer" | "interest" | "contact" | "reference" | "other"
export type CvSection = { kind: SectionKind; title: string; lines: string[] }

const TITLES: Record<Exclude<SectionKind, "other">, string> = {
  summary: "summary|professional summary|executive summary|profile|professional profile|personal profile|about|about me|objective|career objective|personal statement|profil|profil professionnel|a propos|a propos de moi|resume|objectif|objectif professionnel|presentation|sobre mi|perfil|perfil profesional|resumen|resumen profesional|extracto|uber mich|kurzprofil|personliches profil|zusammenfassung|profilo|chi sono|sobre mim|resumo|over mij|profiel|نبذة عني|نبذة|نبذة شخصية|الملف الشخصي|الهدف الوظيفي|الهدف المهني|ملخص|الملخص|الملخص المهني",
  experience: "experience|experiences|work experience|professional experience|relevant experience|employment|employment history|work history|career|career history|professional background|positions held|internships|experience professionnelle|experiences professionnelles|experiences|parcours professionnel|stages|stages et experiences|emplois|experiencia|experiencia profesional|experiencia laboral|trayectoria|trayectoria profesional|historial laboral|berufserfahrung|berufliche erfahrung|beruflicher werdegang|werdegang|berufspraxis|praktische erfahrung|praktika|esperienza|esperienze|esperienza professionale|esperienze professionali|esperienza lavorativa|experiencia profissional|werkervaring|الخبرة المهنية|الخبرات المهنية|الخبرة العملية|الخبرات العملية|الخبرات|الخبرة|التجارب المهنية|التجربة المهنية",
  education: "education|academic background|academic qualifications|education and training|education & training|studies|qualifications|formation|formations|formation academique|etudes|parcours academique|parcours scolaire|cursus|diplomes|diplomes et formations|formacion|formacion academica|estudios|educacion|ausbildung|bildung|studium|bildungsweg|schulbildung|akademische ausbildung|schule und studium|istruzione|formazione|istruzione e formazione|educacao|formacao|formacao academica|opleiding|opleidingen|التعليم|الدراسة|المؤهلات العلمية|المؤهلات|التكوين|المسار الدراسي|التعليم والتكوين",
  skill: "skills|technical skills|core skills|key skills|professional skills|hard skills|soft skills|competencies|core competencies|expertise|areas of expertise|technologies|tools|tech stack|technical stack|competences|competences techniques|competences cles|savoir-faire|savoir faire|outils|atouts|qualites|informatique|habilidades|competencias|aptitudes|conocimientos|kenntnisse|fahigkeiten|kompetenzen|fachkenntnisse|edv-kenntnisse|edv kenntnisse|it-kenntnisse|it kenntnisse|competenze|capacita e competenze|competencias tecnicas|vaardigheden|المهارات|المهارات التقنية|الكفاءات|المهارات الشخصية|المهارات المهنية",
  language: "languages|language skills|spoken languages|langues|langues parlees|idiomas|lenguas|sprachen|sprachkenntnisse|lingue|conoscenze linguistiche|linguas|talen|talenkennis|اللغات",
  certification: "certifications|certificates|certification|licenses|licenses & certifications|licenses and certifications|licences & certifications|courses|training|trainings|professional development|certificats|formations complementaires|certificaciones|cursos|certificados|zertifikate|zertifizierungen|weiterbildung|weiterbildungen|fortbildung|fortbildungen|certificazioni|corsi|certificacoes|certificaten|cursussen|الشهادات|الدورات التدريبية|الدورات|الشهادات المهنية",
  project: "projects|personal projects|side projects|selected projects|key projects|academic projects|open source|open-source|open-source projects|open source projects|projets|projets personnels|projets academiques|projets realises|realisations|proyectos|proyectos personales|projekte|progetti|projetos|projecten|المشاريع|مشاريع",
  event: "talks|talks & conferences|talks and conferences|conferences|speaking|speaking engagements|public speaking|invited talks|presentations|events|conferences et evenements|evenements|interventions|charlas|charlas y eventos|ponencias|conferencias|eventos|vortrage|konferenzen|veranstaltungen|conferenze|eventi|palestras|hackathons|workshops|meetups|المؤتمرات|الفعاليات|المحاضرات|الندوات",
  achievement: "awards|honors|honours|achievements|awards and honors|awards & honors|honors & awards|honours & awards|accomplishments|distinctions|prix|prix et distinctions|recompenses|premios|logros|reconocimientos|auszeichnungen|preise|premi|riconoscimenti|premios e distincoes|الجوائز|الإنجازات|الانجازات|الجوائز والتكريمات",
  publication: "publications|papers|research|patents|publicaciones|veroffentlichungen|pubblicazioni|publicacoes|publicaties|المنشورات|الأبحاث",
  volunteer: "volunteering|volunteer experience|volunteer work|volunteer|community|leadership|extracurricular activities|extracurricular|activities|benevolat|engagements|engagement|engagement associatif|vie associative|activites associatives|activites extra-professionnelles|activites|voluntariado|ehrenamt|ehrenamtliche tatigkeiten|ehrenamtliches engagement|volontariato|vrijwilligerswerk|العمل التطوعي|التطوع|الأنشطة",
  interest: "interests|hobbies|hobbies & interests|hobbies and interests|interests & hobbies|personal interests|centres d interet|centre d interet|loisirs|passions|intereses|aficiones|interessen|hobbys|interessi|interesses|hobby s|الهوايات|الاهتمامات",
  contact: "contact|contacts|contact details|contact information|personal details|personal information|personal data|coordonnees|informations personnelles|etat civil|contacto|datos personales|datos de contacto|kontakt|kontaktdaten|personliche daten|personliche angaben|zur person|contatti|dati personali|contato|dados pessoais|persoonlijke gegevens|معلومات الاتصال|المعلومات الشخصية|البيانات الشخصية|للتواصل",
  reference: "references|referees|referenzen|referencias|referenze|referenties|المراجع|المعرفون",
}

const fold = (value: string) => value.normalize("NFKD").replace(/[\u0300-\u036f\u064b-\u0655]/g, "").toLowerCase().replace(/[’'`]/g, " ").replace(/[^\p{L}\p{N}&\- ]+/gu, " ").replace(/\s+/g, " ").trim()
const LOOKUP = new Map<string, SectionKind>()
for (const [kind, titles] of Object.entries(TITLES) as [SectionKind, string][]) for (const title of titles.split("|")) if (!LOOKUP.has(fold(title))) LOOKUP.set(fold(title), kind)

/** Titles of the whole document, not of a section. */
const DOCUMENT_TITLE = /^(?:curriculum vitae|curriculum|cv|resume|lebenslauf|السيرة الذاتية|سيرة ذاتية)$/

/** The section a title line opens, or null when the line is content. */
export function sectionKind(line: string): SectionKind | null {
  const text = line.trim().replace(/[:.\s]+$/, "")
  if (!text || text.length > 48 || /^[•*\-–]\s/.test(text) || /\d{2}/.test(text)) return null
  const plain = fold(text)
  if (!plain || plain.split(" ").length > 6) return null
  const direct = LOOKUP.get(plain)
  if (direct) return direct
  // "Skills & Tools", "Formation et diplômes", "Sprachen / Kenntnisse": the first part that is a title decides.
  const parts = plain.split(/\s+(?:&|and|et|y|e|und|en|و)\s+|\s*\/\s*|\s*,\s*/).filter(Boolean)
  if (parts.length > 1 && parts.every((part) => part.split(" ").length <= 3)) {
    const kinds = parts.map((part) => LOOKUP.get(part)).filter((kind): kind is SectionKind => Boolean(kind))
    if (kinds.length) return kinds[0]
  }
  return null
}

/** A short line in capitals with no digits: a title this module has no word for ("WHAT I DO BEST"). */
function unknownTitle(line: string, previous: string | undefined): boolean {
  const text = line.trim()
  if (text.length < 4 || text.length > 40 || /\d|[.,;:@]/.test(text) || text.split(/\s+/).length > 5) return false
  const letters = text.match(/\p{L}/gu) ?? []
  const upper = text.match(/\p{Lu}/gu) ?? []
  return letters.length >= 4 && upper.length === letters.length && (previous === undefined || !previous.trim())
}

/** `header` is everything before the first title: usually the name and contact details. */
export function splitSections(text: string): { header: string[]; sections: CvSection[] } {
  const header: string[] = []
  const sections: CvSection[] = []
  let current: CvSection | null = null
  const lines = text.split(/\r?\n/)
  lines.forEach((line, index) => {
    const known = sectionKind(line)
    // The first lines are the name and headline, even when the headline is a word like "Profil".
    const title = known ?? (unknownTitle(line, lines[index - 1]) && index > 1 ? "other" : null)
    if (title && !DOCUMENT_TITLE.test(fold(line))) {
      current = { kind: title, title: line.trim().replace(/[:\s]+$/, ""), lines: [] }
      sections.push(current)
    } else if (DOCUMENT_TITLE.test(fold(line))) return
    else if (current) current.lines.push(line)
    else header.push(line)
  })
  for (const section of sections) {
    while (section.lines.length && !section.lines[0].trim()) section.lines.shift()
    while (section.lines.length && !section.lines.at(-1)!.trim()) section.lines.pop()
  }
  return { header, sections }
}

/** Whether a line is a section title (known or in capitals), for telling titles from content. */
export const isTitleLine = (line: string) => sectionKind(line) !== null || unknownTitle(line, "")

/**
 * Cuts a long CV into parts of at most `size` characters, at section borders
 * where it can, so each part can be read on its own.
 */
export function splitForReading(text: string, size: number): string[] {
  if (text.length <= size) return [text]
  const { header, sections } = splitSections(text)
  const blocks = [header.join("\n"), ...sections.map((section) => [section.title, ...section.lines].join("\n"))].filter((block) => block.trim())
  const pieces = blocks.flatMap((block) => {
    if (block.length <= size) return [block]
    // One very long section: cut at blank lines, keeping its title on every piece.
    const [title, ...rest] = block.split("\n")
    const out: string[] = []
    let piece: string[] = []
    let length = 0
    const groups = rest.join("\n").split(/\n\s*\n/)
    // No blank lines at all: cut before lines that are not bullets (the start of an entry).
    const units = groups.length > 1 ? groups : rest.reduce<string[]>((all, line) => (all.length && (/^\s*[•*\-–]/.test(line) || all.at(-1)!.length < size / 6) ? [...all.slice(0, -1), `${all.at(-1)}\n${line}`] : [...all, line]), [])
    for (const unit of units) {
      if (length + unit.length > size - title.length - 2 && piece.length) {
        out.push([title, ...piece].join("\n\n"))
        piece = []
        length = 0
      }
      piece.push(unit)
      length += unit.length + 2
    }
    if (piece.length) out.push([title, ...piece].join("\n\n"))
    return out
  })
  const parts: string[] = []
  for (const piece of pieces) {
    if (parts.length && parts.at(-1)!.length + piece.length + 2 <= size) parts[parts.length - 1] += `\n\n${piece}`
    else parts.push(piece)
  }
  return parts
}
