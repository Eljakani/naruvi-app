/**
 * Contract types and programme details (duration, start, school rhythm) for
 * every kind of job: permanent, fixed-term, freelance, internship,
 * apprenticeship / alternance, student jobs, volunteer programmes, temp work,
 * seasonal work. Pure, multilingual rules (EN, FR, DE, ES).
 */
export const CONTRACT_TYPES = {
  permanent: "Permanent / CDI / indefinite",
  fixed_term: "Fixed-term / CDD",
  freelance: "Freelance, contractor or consulting mission",
  internship: "Internship / stage / Praktikum / prácticas",
  apprenticeship: "Apprenticeship / alternance / work-study / Ausbildung / duales Studium",
  student_job: "Student job alongside studies / Werkstudent / job étudiant",
  volunteer: "Volunteer programme: VIE, service civique, volunteering",
  temporary: "Temporary agency work / intérim / Zeitarbeit",
  seasonal: "Seasonal work / saisonnier",
  unspecified: "Not stated",
} as const
export type ContractType = keyof typeof CONTRACT_TYPES

/**
 * Most specific first: an alternance posting often says "possibilité de CDI à
 * l'issue", and an internship may mention the team's permanent staff.
 */
const RULES: [ContractType, RegExp][] = [
  ["apprenticeship", /\balternance\b|\balternant(?:e)?\b|apprenti(?:e|ssage)?\b|contrat de professionnalisation|contrat pro\b|apprenticeship|work[- ]study|\bausbildung\b|duales? studium|formación dual/i],
  ["internship", /\bstagiaire\b|\bstage\b(?! (?:of|in|at|de recrutement))|\binternship\b|\bintern\b|\bpraktikum\b|\bpraktikant(?:in)?\b|\bprácticas\b|\bbecario\b|fin d['’]études/i],
  ["student_job", /\bwerkstudent(?:in)?\b|job étudiant|student job|part[- ]time student|empleo para estudiantes/i],
  ["volunteer", /\bV\.?I\.?E\.?\b|volontariat international|service civique|\bvolunteer(?:ing)?\b|bénévol/i],
  ["temporary", /\bintérim\b|\binterim\b|mission d['’]intérim|temp(?:orary)? agency|zeitarbeit|leiharbeit|trabajo temporal/i],
  ["seasonal", /saisonni(?:er|ère)|\bseasonal\b|saisonarbeit|\btemporada\b/i],
  ["freelance", /freelance|\bcontractor\b|portage salarial|\bTJM\b|day rate|freiberuflich|autónomo/i],
  ["fixed_term", /\bCDD\b|fixed[- ]term|befristet(?!e Übernahme)|contrato temporal|temporary contract/i],
  ["permanent", /\bCDI\b|permanent (?:contract|position|role)|unbefristet|contrato indefinido|full[- ]time employee/i],
]

export function contractOf(text: string): ContractType {
  return RULES.find(([, pattern]) => pattern.test(text))?.[0] ?? "unspecified"
}

export type Programme = { duration: string; start: string; rhythm: string }

const clip = (value: string | undefined) => (value ?? "").replace(/\s+/g, " ").trim().slice(0, 60)

/** Duration, start date and school/company rhythm, written as the posting writes them. */
export function programmeOf(text: string): Programme {
  const duration = text.match(/\b(\d{1,2}\s*(?:à|-|–|to|bis|a)?\s*\d{0,2}\s*(?:mois|months?|monate?|meses|semaines|weeks|wochen|ans|years?|jahre))\b(?=[^.\n]{0,40}(?:stage|alternance|contrat|internship|apprenticeship|programme|program|mission|praktikum|ausbildung|prácticas|durée|duration|dauer|duración)|)/i)?.[1]
    ?? text.match(/(?:durée|duration|dauer|duración)\s*(?:du (?:stage|contrat))?\s*[:\-–]?\s*(\d{1,2}\s*(?:à|-|–|to)?\s*\d{0,2}\s*(?:mois|months?|monate?|meses|ans|years?))/i)?.[1]
  const start = text.match(/(?:à partir d[eu]|dès|démarrage|début|start(?:ing)?(?: date)?|from|ab|a partir de|inicio)\s*[:\-–]?\s*((?:le\s+)?(?:\d{1,2}(?:er)?\s+)?(?:janvier|février|mars|avril|mai|juin|juillet|août|septembre|octobre|novembre|décembre|january|february|march|april|may|june|july|august|september|october|november|december|januar|februar|märz|juni|juli|oktober|dezember|enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre|asap|dès que possible|immédiatement|immediately|sofort)(?:\s+\d{4})?)/i)?.[1]
  const rhythm = text.match(/(\d\s*(?:jours?|j|semaines?|sem\.?|weeks?|days?|tage|wochen)\s*(?:en |à l['’]|in (?:the )?)?(?:entreprise|company|école|school|cours|betrieb|schule)?\s*(?:\/|et|and|und|-|–)\s*\d\s*(?:jours?|j|semaines?|sem\.?|weeks?|days?|tage|wochen)\s*(?:en |à l['’]|in (?:the )?)?(?:école|school|entreprise|company|cours|schule|betrieb)?)/i)?.[1]
    ?? text.match(/rythme\s*(?:d['’]alternance)?\s*[:\-–]?\s*([^.\n]{4,50})/i)?.[1]
  return { duration: clip(duration), start: clip(start), rhythm: clip(rhythm) }
}
