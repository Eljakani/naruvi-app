/**
 * Deterministic extraction of role, company and location from pasted job
 * text (EN/FR). Pure. Each value carries the rule that produced it so the UI
 * can say where it came from, and nothing is invented: a field without
 * evidence stays empty.
 */
import { normalizeText } from "@/lib/job-text"

export type Extracted = {
  role: string
  company: string
  location: string
  remote: string
  evidence: { role?: string; company?: string; location?: string }
}

// Occupation words across fields (tech, business, care, education, trades,
// hospitality, public sector…), EN + FR. Used only as evidence that a phrase
// is a job title; extend freely.
const ROLE_WORD = new RegExp(
  "\\b(" +
    [
      // generic levels & functions
      "manager", "lead", "head", "director", "directeur", "directrice", "chief", "officer", "associate", "assistant(?:e)?", "coordinator", "coordinat(?:eur|rice)", "supervisor", "superviseu(?:r|se)", "specialist", "sp[ée]cialiste", "consultant(?:e)?", "advisor", "adviser", "conseill(?:er|ère)", "analyst(?:e)?", "expert(?:e)?", "responsable", "charg[ée]e? (?:de|d')", "chef", "partner", "representative", "executive", "agent", "administrator", "administrat(?:eur|rice)", "intern", "internship", "stagiaire", "stage", "alternant(?:e)?", "apprenti(?:e)?", "trainee", "graduate", "employ[ée]e?",
      // tech & engineering
      "engineer", "ing[ée]nieur(?:e)?", "developer", "d[ée]veloppeu(?:r|se)", "programmer", "architect(?:e)?", "designer", "devops", "devsecops", "sre", "scientist", "researcher", "chercheu(?:r|se)", "technician", "technicien(?:ne)?", "pentester", "auditor", "auditeur", "owner",
      // business, finance, sales, people
      "accountant", "comptable", "controller", "contr[ôo]leu(?:r|se)", "buyer", "acheteu(?:r|se)", "recruiter", "recruteu(?:r|se)", "salesperson", "vendeu(?:r|se)", "commercial(?:e)?", "marketer", "account", "cashier", "caissi(?:er|ère)", "clerk", "secretary", "secr[ée]taire", "receptionist", "r[ée]ceptionniste", "paralegal", "lawyer", "avocat(?:e)?", "juriste", "notaire", "economist", "planner", "planificat(?:eur|rice)",
      // care, health, social
      "nurse", "infirmi(?:er|ère)", "doctor", "physician", "m[ée]decin", "pharmacist", "pharmacien(?:ne)?", "therapist", "th[ée]rapeute", "psychologist", "psychologue", "caregiver", "aide[- ]soignante?", "midwife", "sage[- ]femme", "dentist", "dentiste", "paramedic", "social worker", "[ée]ducat(?:eur|rice)", "veterinarian", "v[ée]t[ée]rinaire",
      // education & culture
      "teacher", "enseignant(?:e)?", "professeur(?:e)?", "lecturer", "tutor", "trainer", "formateur", "formatrice", "librarian", "biblioth[ée]caire", "writer", "r[ée]dact(?:eur|rice)", "editor", "journalist(?:e)?", "translator", "traduct(?:eur|rice)", "photographer", "photographe",
      // trades, logistics, hospitality, public services
      "driver", "chauffeur", "electrician", "[ée]lectricien(?:ne)?", "plumber", "plombier", "mechanic", "m[ée]canicien(?:ne)?", "welder", "soudeu(?:r|se)", "carpenter", "menuisier", "operator", "op[ée]rat(?:eur|rice)", "warehouse", "magasinier", "logisticien(?:ne)?", "cook", "cuisini(?:er|ère)", "chef de cuisine", "baker", "boulang(?:er|ère)", "waiter", "waitress", "serveu(?:r|se)", "barista", "housekeeper", "cleaner", "agent d'entretien", "security guard", "agent de s[ée]curit[ée]", "firefighter", "pompier", "police", "gardien(?:ne)?", "pilot", "pilote", "cto", "ciso", "rssi", "ceo", "cfo", "coo",
    ].join("|") +
    ")\\b",
  "i",
)

const GENERIC_COMPANY = /^(we|us|our|the company|the team|the role|the job|the position|you|nous|notre|l'entreprise|the client|our client|notre client|un grand groupe|a leading)$/i

const clean = (value: string) =>
  value
    .replace(/\s+/g, " ")
    .replace(/^[\s"“'«]+|[\s"”'»,.;:!–—-]+$/g, "")
    .trim()

/** Cut a role phrase at the first word that clearly starts something else. */
function cleanRole(value: string) {
  return clean(
    value
      .split(/\s+(?:in|at|to|for|who|that|with|and|based|located|within|on|à|au|aux|en|et|pour|qui|chez|dans|afin|au sein)\s+|[,;(.!?]|\s[–—-]\s|\s\|\s/i)[0] ?? "",
  )
}

function cleanCompany(value: string) {
  const company = clean(value.split(/\s+(?:is|are|recrute|recherche|cherche|hires|has|was)\b|[,;(.!?|·]/i)[0] ?? "")
  if (!company || company.length > 60 || GENERIC_COMPANY.test(company) || company.split(" ").length > 6) return ""
  return company
}

const LOCATION_HINT = /\b(remote|hybrid|on-?site|full remote|t[ée]l[ée]travail|hybride|sur site|pr[ée]sentiel)\b/i

function cleanLocation(value: string) {
  const first = value.split(/\s+(?:with|and|for|to|où|avec|pour)\s+|[.;!?]/i)[0] ?? ""
  // Keep "Paris, Île-de-France, France"; drop ", télétravail partiel possible".
  const parts = first.split(",").map((part) => part.trim())
  const kept = [parts[0], ...parts.slice(1).filter((part, i, all) => all.slice(0, i + 1).every((p) => /^[A-ZÀ-Ý0-9]/.test(p)))]
  const location = clean(kept.join(", ")).replace(/\s*\((?:hybrid|remote|on-?site|hybride)\)$/i, "")
  return location.length <= 80 ? location : ""
}

export function extractFromText(raw: string): Extracted {
  const text = normalizeText(raw)
  const lines = text.split("\n").filter(Boolean)
  const head = lines.slice(0, 12)
  const headText = head.join("\n")
  const out: Extracted = { role: "", company: "", location: "", remote: "", evidence: {} }
  const set = (field: "role" | "company" | "location", value: string, rule: string) => {
    if (!out[field] && value) {
      out[field] = value
      out.evidence[field] = rule
    }
  }

  // 1. Labelled fields: "Job title: …", "Entreprise : …", "Location: …"
  for (const line of lines.slice(0, 40)) {
    const match = line.match(/^\s*(?:\*\*)?([A-Za-zÀ-ÿ' ]{3,32})(?:\*\*)?\s*:\s*(.+)$/)
    if (!match) continue
    const label = match[1].toLowerCase().trim()
    const value = match[2]
    if (/^(job title|title|role|position|poste|intitul[ée]( du poste)?|fonction)$/.test(label)) set("role", cleanRole(value), "labelled field")
    else if (/^(company|employer|organi[sz]ation|entreprise|soci[ée]t[ée]|employeur|client)$/.test(label)) set("company", cleanCompany(value), "labelled field")
    else if (/^(location|lieu|localisation|ville|city|based in|work location|lieu de travail)$/.test(label)) set("location", cleanLocation(value), "labelled field")
  }

  // 2. Hiring sentences.
  const sentencePatterns: [RegExp, "company+role" | "role", string][] = [
    [/([A-ZÀ-Ý][\wÀ-ÿ&'’. -]{1,50}?)\s+(?:is|are)\s+(?:currently\s+)?(?:hiring|looking for|seeking|recruiting)\s+(?:an?\s+|our\s+(?:next|new|first)\s+)?([^\n.]{3,90})/, "company+role", "hiring sentence"],
    [/([A-ZÀ-Ý][\wÀ-ÿ&'’. -]{1,50}?)\s+(?:recrute|recherche)\s+(?:un(?:e)?\s+|son\s+|sa\s+|ses\s+|des\s+)?(?:futur(?:e)?\s+|nouveau\s+|nouvelle\s+)?([^\n.]{3,90})/, "company+role", "phrase de recrutement"],
    [/\bjoin\s+([A-ZÀ-Ý][\wÀ-ÿ&'’. -]{1,50}?)\s+as\s+(?:an?\s+|our\s+)?([^\n.]{3,90})/i, "company+role", "join sentence"],
    [/\brejoi(?:ndre|gnez)\s+([A-ZÀ-Ý][\wÀ-ÿ&'’. -]{1,50}?)\s+en tant que\s+([^\n.]{3,90})/i, "company+role", "phrase de recrutement"],
    [/\b(?:we(?:'re| are)|we're)\s+(?:currently\s+)?(?:looking for|hiring|seeking)\s+(?:an?\s+)?([^\n.]{3,90})/i, "role", "hiring sentence"],
    [/\bnous\s+(?:recherchons|recrutons)\s+(?:un(?:e)?\s+)?([^\n.]{3,90})/i, "role", "phrase de recrutement"],
  ]
  for (const [pattern, kind, rule] of sentencePatterns) {
    const match = text.slice(0, 4000).match(pattern)
    if (!match) continue
    const roleText = kind === "role" ? match[1] : match[2]
    const role = cleanRole(roleText)
    if (role && ROLE_WORD.test(role)) {
      set("role", role, rule)
      if (kind === "company+role") set("company", cleanCompany(match[1]), rule)
      const where = roleText.match(/\b(?:in|à|based in|located in|basé(?:e)? à)\s+([A-ZÀ-Ý][^\n.;()]{1,60})/)
      if (where) set("location", cleanLocation(where[1]), rule)
    }
  }

  // 3. Title line patterns in the first lines: "Role at Company", "Role - Company", "Company | Role".
  for (const line of head.slice(0, 4)) {
    if (line.length > 120) continue
    const at = line.match(/^(.{3,80}?)\s+(?:at|chez|@)\s+(.{2,60})$/i)
    if (at && ROLE_WORD.test(at[1])) {
      set("role", cleanRole(at[1]), "title line")
      set("company", cleanCompany(at[2]), "title line")
      continue
    }
    const split = line.match(/^(.{2,80}?)\s+[|–—-]\s+(.{2,80})$/)
    if (split) {
      const [left, right] = [clean(split[1]), clean(split[2])]
      if (ROLE_WORD.test(left) && !ROLE_WORD.test(right)) {
        set("role", left, "title line")
        set("company", cleanCompany(right), "title line")
      } else if (ROLE_WORD.test(right) && !ROLE_WORD.test(left)) {
        set("role", right, "title line")
        set("company", cleanCompany(left), "title line")
      }
    }
  }

  // 4. LinkedIn-style copy: role on line 1, "Company · Location (Hybrid)" on line 2.
  if (head[0] && head[1] && ROLE_WORD.test(head[0]) && head[0].length <= 90 && /[·•|]/.test(head[1])) {
    const [company, location] = head[1].split(/\s*[·•|]\s*/)
    set("role", clean(head[0]), "first lines")
    set("company", cleanCompany(company ?? ""), "first lines")
    if (location && !/\b(ago|applicants?|candidat|il y a|hours?|days?|weeks?)\b/i.test(location)) set("location", cleanLocation(location), "first lines")
  }

  // 5. A short first line that names a role.
  if (!out.role && head[0] && head[0].length <= 80 && ROLE_WORD.test(head[0]) && !/[.!?]$/.test(head[0]) && head[0].split(" ").length <= 10) {
    set("role", clean(head[0]), "first line")
  }

  // 6. "About Acme" / "À propos de Acme" headings.
  const about = text.match(/^(?:about|à propos d[e'’]|a propos d[e'’])\s*([A-ZÀ-Ý][\wÀ-ÿ&'’. -]{1,40})$/im)
  if (about && !/^(us|the role|the job|the team|the position|you|nous|le poste|l'?entreprise)$/i.test(about[1].trim())) set("company", cleanCompany(about[1]), "about heading")

  // 7. Location phrases anywhere near the top.
  const based = headText.match(/\b(?:based in|located in|located at|poste basé à|basé(?:e)? à|situé(?:e)? à|localis[ée]e? à)\s+([A-ZÀ-Ý][^\n.;()]{1,60})/i)
  if (based) set("location", cleanLocation(based[1]), "location phrase")

  const remote = text.slice(0, 4000).match(LOCATION_HINT)?.[1]
  if (remote) out.remote = /hybri/i.test(remote) ? "Hybrid" : /remote|t[ée]l[ée]travail/i.test(remote) ? "Remote" : "On-site"
  return out
}
