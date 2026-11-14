/**
 * Requirements extraction from a job description. Pure.
 * Uses the same block model as the UI (headings, lists, paragraphs), then
 * classifies sections by their heading.
 */
import { parseJobText } from "@/lib/job-text"
import { keywordsIn, termsIn } from "./keywords"

export type RequirementKind = "must" | "nice" | "responsibility"
export type Requirement = { id: string; text: string; kind: RequirementKind; section: string; keywords: string[]; terms?: string[]; years: number | null; /** The sentence just before a list ("Cela se traduit par exemple par :"), as context. */ lead?: string }

const NICE = /nice to have|bonus|\bplus\b|preferred|desirable|ideally|un plus|appréci|souhait|optionnel|would be great|von vorteil|wünschenswert|idealerweise|nice-to-have|deseable|valorable|se valorar|gradit|preferibil|costituisce un plus|pluspunt|een pré|diferencial|desejável/i
const MUST = /require|qualification|looking for|what (?:do |will |can |should )?you (?:bring|need|have)|who are you|is this you|what (?:do |are )?we (?:expect|look(?:ing)? for|need)|qui êtes-vous|que recherchons-nous|you (?:have|bring)|must|profil|expertise|compétences|skills|experience|about you|who you are|your background|ce que nous recherchons|vous (?:avez|êtes)|critical competencies|meet you if|ideal candidate|you are|you'll need|what we're looking for|nous recherchons|candidat idéal|anforderung|ihr profil|dein profil|bringst du mit|bringen sie mit|voraussetzung|qualifikation|kenntnisse|requisit|perfil|buscamos|lo que buscamos|competenze|cerchiamo|profilo|vereist|wat (?:wij vragen|breng je mee|vragen wij)|profiel|o que procuramos|procuramos/i
const RESPONSIBILITY = /you(?:['’]ll| will)|what (?:will|do|would) you (?:do|be doing)|responsibilit|what you.?ll do|day[- ]to[- ]day|missions?|livrables|key tasks|the role|your role|in this role|tasks|vos missions|vous (?:serez|allez)|at .+ you will|aufgaben|tätigkeit|responsabilidad|funciones|tus tareas|qué harás|mansioni|responsabilità|cosa farai|(?:jouw|je) taken|werkzaamheden|wat ga je doen|atividades|o que (?:você )?(?:vai|irá) fazer/i
const SKIP = /benefit|offer|in return|you(?:['’]ll| will) (?:get|receive|enjoy)|what (?:do|will|can) you (?:get|expect)|what(?:['’]s| is) in it for|ce que vous y gagnez|perks|avantages|salary|rémunération|diversity|inclusion|equal|about (?:us|the company)|à propos|who we are|process|interview|how to apply|location|our tech|tech(?:nical)? stack|stack technique|notre stack|additional info|informations? complémentaires|why join|culture|life at|wir bieten|was wir bieten|über uns|beneficio|ofrecemos|sobre nosotros|offriamo|chi siamo|wij bieden|over ons|oferecemos|benefícios|sobre nós/i

function classify(heading: string): RequirementKind | null {
  if (!heading) return null
  if (NICE.test(heading)) return "nice"
  if (SKIP.test(heading)) return null
  if (MUST.test(heading)) return "must"
  if (RESPONSIBILITY.test(heading)) return "responsibility"
  return null
}

function years(text: string): number | null {
  // "3-5+ years" → 3 (the minimum is the requirement), "5+ years" → 5.
  const match = text.match(/(\d{1,2})\s*\+?\s*(?:(?:-|–|to|à)\s*\d{1,2}\s*\+?\s*)?(?:years?|yrs|ans|années|jahre?n?|años|anni|anos|jaar)/i)
  return match ? Number(match[1]) : null
}

export type ExclusionCategory = "recruitment_process" | "benefits" | "company_information" | "application_instructions" | "job_conditions" | "vague" | "other"
export type ExcludedRequirement = { requirement: Requirement; category: ExclusionCategory; reason: string; source: "rules" | "model" }
export type RequirementExtraction = { candidates: Requirement[]; requirements: Requirement[]; excluded: ExcludedRequirement[] }

function excludedSection(heading: string): ExclusionCategory | null {
  if (/(?:recruitment|hiring|interview) (?:process|steps|stages|experience)|how (?:we|to) (?:hire|apply)|(?:processus|process|étapes?|déroulement).*(?:recrutement|entretien|candidature)|^(?:interviews?|entretiens?)$/i.test(heading)) return "recruitment_process"
  if (/in return|what (?:you(?:['’]ll| will)|do you|will you|can you) (?:get|receive|expect)|ce que vous y gagnez/i.test(heading)) return "benefits"
  if (/^(?:benefits?|perks|avantages|salary|rémunération|what we offer|ce que nous (?:offrons|proposons)|ce qu['’]on (?:vous )?(?:offre|propose)|nos avantages|les \+|les plus|pourquoi (?:nous )?rejoindre|why (?:join|work)|what['’]s in it for you|life at|la vie (?:chez|à|au)|vie d['’]équipe|team life|on vous offre|we offer)/i.test(heading)) return "benefits"
  if (/^(?:(?:was )?wir bieten|(?:qué |lo que )?ofrecemos|beneficios|(?:cosa )?offriamo|(?:wat )?wij bieden|(?:o que )?oferecemos|benefícios)/i.test(heading)) return "benefits"
  if (/^(?:about (?:us|the company)|à propos|who we are|our company|qui sommes-nous)/i.test(heading)) return "company_information"
  if (/^(?:how to apply|apply now|comment postuler|pour postuler|modalités de candidature|interested\b|intéressée?s?\b|ready to (?:apply|join)|convinced\b|want to join|envie de (?:nous rejoindre|postuler))/i.test(heading)) return "application_instructions"
  if (isHiringNote(heading)) return "recruitment_process"
  return SKIP.test(heading) ? "other" : null
}

/** Strong labels describe a step the applicant goes through, not a skill they need. */
export function isRecruitmentStep(text: string): boolean {
  return /^(?:[ée]change(?:s)?\s+(?:rh|op[ée]rationnel(?:le)?|technique)|entretien\s+(?:rh|technique|op[ée]rationnel|t[ée]l[ée]phonique)|(?:hr|technical|final|recruiter)\s+(?:interview|screening)|interview\s+(?:stage|step))\s*[:–—-]/i.test(text.trim())
}

/**
 * What the employer offers or how the team lives: events, afterworks, food, perks,
 * insurance, leave, equity. Found anywhere in a posting (often mixed into the profile
 * list), it's never a candidate requirement. Items that also state a skill or
 * experience are left alone.
 */
const PERK = /\b(?:after[- ]?works?|team[- ]?buildings?|s[ée]minaires?|soir[ée]es?|f[êe]tes?|[ée]v[ée]nements?|[eè]v[eè]nements?|events?(?![- ](?:driven|sourcing|streaming|bus|loop|store))|petits?[- ]d[ée]jeuners?|breakfasts?|snacks?|fruits?|caf[ée]s? offerts?|free (?:lunch|coffee|food)|catered|baby[- ]?foot|ping[- ]?pong|tickets?[- ](?:resto|restaurant)|carte (?:swile|tr|d[ée]jeuner)|swile|mutuelle|pr[ée]voyance|health (?:insurance|care)|rtt|cong[ée]s?|jours? (?:off|de cong[ée]s)|paid (?:time off|leave)|pto|vacations?|salle de sport|gym(?:pass)?|abonnement|navigo|forfait mobilit[ée]|comit[ée] d['’]entreprise|\bcse\b|int[ée]ressement|participation aux b[ée]n[ée]fices|bspce|stock[- ]options|equity|surprises?|goodies|rooftop|terrasse|locaux|bureaux (?:spacieux|lumineux|neufs|en plein)|remote allowance|home office allowance)\b/i
const CANDIDATE_TERMS = /exp[ée]rience|ma[iî]tris|connaissance|comp[ée]tence|savoir|skills?|knowledge|proficien|years?|ans\b|dipl[ôo]m|degree|master|bac\s*\+|certif|fluent|courant|niveau|capacit[ée]|ability|able to|vous (?:[êe]tes|avez|savez)|you (?:are|have|can)/i

export function isEmployerPerk(text: string): boolean {
  return PERK.test(text) && !CANDIDATE_TERMS.test(text)
}

/**
 * When, where or under what papers the job happens: start date, availability,
 * work permit, relocation. A condition of the offer the person either accepts
 * or not (their search goals check it); no fact proves or disproves it, so it
 * must not count as a missing skill. Items that also name a skill are left alone.
 */
const CONDITION = /\b(?:start(?:ing)? date|date de (?:début|démarrage|prise de poste)|available (?:from|to start|immediately|as of)|availability|disponib(?:le|ilité)s?\b|(?:work|working) (?:authori[sz]ation|permit)|right to work|eligible to work|visa sponsorship|autorisation de travail|titre de séjour|permis de travail|willing(?:ness)? to (?:relocate|travel)|open to relocat|relocation|based in|located in|bas[ée]e?s? à|mobilité géographique|convention de stage|rythme d['’]alternance)\b/i

export function isJobCondition(text: string): boolean {
  return CONDITION.test(text) && keywordsIn(text).length === 0 && years(text) === null
}

/**
 * A note from the employer about the hiring itself: accommodations for applicants
 * ("Do you have specific needs or require adjustments during the recruitment
 * process?"), equal-opportunity statements. Nothing a candidate has or lacks.
 * Items that name a skill or experience are left alone.
 */
const HIRING_NOTE = /\b(?:specific needs|special needs|(?:reasonable |workplace )?(?:accommodations?|adjustments?) (?:during|for|in|to|throughout|or)|require (?:any )?(?:accommodations?|adjustments?)|aménagements? (?:de poste|spécifiques?|raisonnables?|particuliers?)|besoins? (?:spécifiques?|particuliers?)|equal[- ]opportunit(?:y|ies)|égalité des chances|regardless of (?:gender|age|race|origin|background|disability)|sans distinction d['’]|during the (?:recruitment|hiring|application|interview) process|(?:pendant|durant|lors d[ue]) (?:le |la )?(?:processus de )?(?:recrutement|candidature))\b/i

export function isHiringNote(text: string): boolean {
  return HIRING_NOTE.test(text) && keywordsIn(text).length === 0 && years(text) === null && !/exp[ée]rience|knowledge|connaissance|ma[iî]tris|proficien/i.test(text)
}

/**
 * Words that describe a mood or a personality, not something a CV can show
 * ("Passionate and curious", "Team player", "Good vibes only", "Eager to learn").
 * A line made only of these (and small words) is too vague to check.
 */
const TRAIT_WORDS = new Set(("passion passionate passionné passionnée passionnés motivated motivation motivé motivée motivés curious curiosity curieux curieuse dynamic dynamique enthusiastic enthusiasm enthousiaste energetic energy énergie positive positif positive attitude mindset état d'esprit rockstar rockstars ninja ninjas guru awesome amazing great cool fun funny smile smiling sourire souriant souriante humour humor sense sens good bonne bon vibes vibe hungry driven ambitious ambition ambitieux ambitieuse team player players spirit esprit équipe love eager keen genuine friendly nice happy humble open-minded ouvert ouverte can-do go-getter self-starter proactive proactif proactive yourself toi-même learn learning apprendre envie heart cœur coeur smart grit hustle hard-working hardworking hard worker worker excited exciting passioné bienveillant bienveillante sympa motiviert neugierig teamfähig teamplayer leidenschaft motivado motivada apasionado apasionada curioso curiosa motivato motivata appassionato appassionata gemotiveerd enthousiast nieuwsgierig").split(" "))
const FILLER_WORDS = new Set("a an the and or & of for to with be is are you your who what do have has being who's one d de du des et ou un une le la les l être avoir avec pour qui à en un ein eine und mit y con el la un una e il lo di per en een het van met zijn only always very really truly real vrai vraie vrais vraies true bit lot little".split(" "))
const FILLER_LINE = /^(?:etc\.?|and (?:much |so )?more|and so on|you name it|more to come|et (?:bien )?(?:plus|d['’]autres)(?: encore)?|y más|und vieles mehr|e molto altro|en meer|\.{3}|…)[.!…]*$/i

/** A line too vague for any evidence to prove or disprove: filler, or personality words only. */
export function isVagueLine(text: string): boolean {
  const clean = text.trim().replace(/[!.…]+$/, "")
  if (FILLER_LINE.test(clean) || !/\p{L}/u.test(clean)) return true
  if (keywordsIn(text).length || years(text) !== null) return false
  const words = clean.toLowerCase().split(/[^\p{L}'’-]+/u).map((word) => word.replace(/^[-'’]+|[-'’]+$/g, "")).filter(Boolean)
  if (!words.length || words.length > 8) return false
  const traits = words.filter((word) => TRAIT_WORDS.has(word))
  return traits.length > 0 && words.every((word) => TRAIT_WORDS.has(word) || FILLER_WORDS.has(word))
}

/** A question is never a requirement: it titles what follows ("What do you bring?") or talks to the reader ("Ready to apply?"). */
const isQuestion = (text: string) => /\?\s*["”»)]?\s*$/.test(text)
/** A person described in the second person ("You enjoy working with developers"), the way profile sections are written. */
const CANDIDATE_VOICE = /^(?:you(?:['’]re)?|vous|tu|du|sie|usted|lei|você|je|jij)\b(?!\s+(?:will|['’]ll|get|receive|benefit|bénéficie|aurez|serez|allez))/i

const EXCLUDED_REASONS: Record<ExclusionCategory, string> = {
  job_conditions: "A condition of the job (start date, availability, permit, place), not a skill to prove.",
  recruitment_process: "Describes the hiring or interview process, not a candidate requirement.",
  benefits: "Describes compensation or benefits offered by the employer.",
  company_information: "Describes the company rather than a candidate qualification or duty.",
  application_instructions: "Explains how to apply rather than what the candidate needs to demonstrate.",
  vague: "Too vague to check: a personality trait or filler, not a skill, experience or duty.",
  other: "Outside a recognized requirements or responsibilities section.",
}

/**
 * A paragraph that introduces examples of how the company works ("Cela se traduit
 * par exemple par :", "This means:"): the list after it describes the company.
 */
const INTRODUCES_PRACTICES = /(?:se traduit (?:notamment |concrètement )?par(?: exemple)?(?: par)?|concrètement|this (?:means|translates (?:into|to))|in practice|for example|par exemple|zum beispiel|en la práctica)\s*:\s*$/i

/**
 * A sentence in running text that states what the candidate must know or have
 * ("Côté compétences, vous maîtrisez GitLab et AWS.", "You have 5+ years of
 * experience with Go"). Lists are not the only place postings put requirements.
 */
const REQUIREMENT_SENTENCE = /\b(?:vous ma[iî]trisez|vous (?:avez|possédez|disposez d['’]) (?:une |un |de l['’]|des |d['’])?(?:bonne |solide |excellente |réelle |première )?(?:connaissance|expérience|maîtrise|expertise|pratique)|(?:maîtrise|connaissance (?:avancée |approfondie )?) (?:de|d['’]|du|des)|\d+\s*\+?\s*(?:ans|années) d['’]expérience|you (?:have|bring|know|are fluent|master)\b|(?:hands-on |strong |solid |proven )?experience (?:with|in|using|of)|\d+\s*\+?\s*years? of (?:professional |relevant )?experience|proficien(?:t|cy) (?:in|with)|knowledge of|(?:is |are )?(?:required|a must)|must have|sie (?:haben|verfügen über|beherrschen)|(?:erfahrung|kenntnisse) (?:mit|in|im)|experiencia (?:en|con)|años de experiencia|conocimientos? de|du (?:hast|bringst|kennst|beherrschst)|esperienza (?:in|con|di|nel|nella)|conoscenz[ae] (?:di|del|della|dei)|anni di esperienza|experiência (?:em|com)|conhecimentos? (?:de|em)|anos de experiência|ervaring (?:met|in|als)|kennis van|jaar (?:werk)?ervaring)/i

const sentences = (text: string) => text.split(/(?<=[.!?])\s+(?=\p{Lu})/u).map((sentence) => sentence.trim()).filter(Boolean)

/** Keep all source candidates for AI classification, with a conservative rules-only baseline. */
export function extractRequirementCandidates(rawText: string): RequirementExtraction {
  const blocks = parseJobText(rawText)
  const candidates: Requirement[] = []
  const preferred: Requirement[] = []
  const fallback: Requirement[] = []
  const excluded: ExcludedRequirement[] = []
  let heading = ""
  let kind: RequirementKind | null = null
  let sectionExclusion: ExclusionCategory | null = null
  let practices = false
  let lead = ""
  /** A new section starts at this title. Among list items, a question that says nothing about the section ("Sounds like you?") keeps the current one. */
  const enter = (title: string, keep = false) => {
    const next = classify(title)
    const exclusion = excludedSection(title)
    if (keep && !next && !exclusion) return
    heading = title
    kind = next
    sectionExclusion = exclusion
    practices = false
    lead = ""
  }
  for (const block of blocks) {
    if (block.type === "heading") {
      enter(block.text)
      continue
    }
    if (block.type === "paragraph") {
      // A short question standing alone titles the section after it, like a heading.
      if (isQuestion(block.text) && block.text.length <= 140 && sentences(block.text).length === 1) {
        enter(block.text)
        continue
      }
      // A short title line left as a paragraph ("Requirements" with only bare lines after it) still starts a section.
      const title = block.text.replace(/:$/, "")
      if (title.split(/\s+/).length <= 5 && !/[.!;,]$/.test(title) && keywordsIn(title).length === 0 && years(title) === null && (classify(title) || excludedSection(title))) {
        enter(title)
        continue
      }
      practices = INTRODUCES_PRACTICES.test(block.text)
      lead = (sentences(block.text).at(-1) ?? "").slice(0, 200)
      if (sectionExclusion) continue
      const single = sentences(block.text).length === 1
      for (const sentence of sentences(block.text)) {
        if (isQuestion(sentence) || isHiringNote(sentence) || sentence.length > 400) continue
        // In a profile section, "You enjoy…" describes the candidate even without the usual wording.
        const profileVoice = (kind === "must" || kind === "nice") && sentence.length >= 30 && CANDIDATE_VOICE.test(sentence) && !isEmployerPerk(sentence) && !isJobCondition(sentence)
        // A short line on its own in a requirements or duties section ("Python", "Fluent English") is an item written without a bullet.
        const shortItem = kind !== null && single && sentence.length <= 160 && !/:$/.test(sentence) && !isEmployerPerk(sentence) && !isJobCondition(sentence) && !isVagueLine(sentence)
        if (!REQUIREMENT_SENTENCE.test(sentence) && !profileVoice && !shortItem) continue
        if (isVagueLine(sentence)) continue
        const sentenceKind: RequirementKind = kind === "responsibility" && !REQUIREMENT_SENTENCE.test(sentence) ? "responsibility" : NICE.test(sentence) || kind === "nice" ? "nice" : "must"
        const requirement: Requirement = { id: `r${candidates.length + 1}`, text: sentence, kind: sentenceKind, section: heading, keywords: keywordsIn(sentence), terms: termsIn(sentence), years: years(sentence) }
        candidates.push(requirement)
        preferred.push(requirement)
      }
      continue
    }
    if (block.type !== "list") continue
    const fromLead: ExclusionCategory | null = practices ? "company_information" : null
    practices = false
    for (const item of block.items) {
      // "Notre stack technique comprend :" inside a list labels the items after it: a sub-heading, not a requirement.
      if (LIST_LABEL.test(item)) {
        const label = item.replace(/\s*:\s*$/, "")
        heading = label
        kind = classify(label) ?? kind
        if (excludedSection(label)) sectionExclusion = excludedSection(label)
        lead = item
        continue
      }
      // A question among the items titles the ones after it, or addresses the reader: never a requirement.
      if (isQuestion(item)) {
        enter(item, true)
        continue
      }
      const listExclusion = sectionExclusion ?? fromLead
      const itemKind: RequirementKind = kind !== "responsibility" && /\b(a plus|un plus|bonus|nice to have|preferred|idéalement|appréci|von vorteil|wünschenswert|idealerweise|deseable|valorable|se valorar|gradit|un plus|pluspunt|desejável)/i.test(item) ? "nice" : kind ?? "must"
      const requirement: Requirement = { id: `r${candidates.length + 1}`, text: item, kind: itemKind, section: heading, keywords: keywordsIn(item), terms: termsIn(item), years: years(item), ...(lead ? { lead } : {}) }
      candidates.push(requirement)
      const category = isRecruitmentStep(item) || isHiringNote(item) ? "recruitment_process" : isEmployerPerk(item) ? "benefits" : isJobCondition(item) ? "job_conditions" : isVagueLine(item) ? "vague" : listExclusion
      if (category) excluded.push({ requirement, category, source: "rules", reason: EXCLUDED_REASONS[category] })
      else if (kind) preferred.push(requirement)
      else fallback.push(requirement)
    }
  }
  // Never reintroduce explicitly excluded benefits/interview steps through fallback.
  const requirements = dedupe(preferred.length ? preferred : fallback, candidates)
  if (preferred.length) for (const requirement of fallback) excluded.push({ requirement, category: "other", source: "rules", reason: EXCLUDED_REASONS.other })
  return { candidates, requirements, excluded }
}

/** A short list line ending in a colon, with no sentence before it: it introduces the items that follow. */
const LIST_LABEL = /^[^.!?:]{2,80}:\s*$/

/** Salary, contract and place details: an offer sentence that also happens to mention experience. */
const OFFER_NOISE = /\d\s*[kK]?\s*[€$£]|[€$£]\s*\d|\b(?:salaire|rémunération|salary|compensation|gehalt|salario|CDI|CDD|full[- ]time|part[- ]time|télétravail|remote)\b/i

/**
 * Postings often repeat the same minimum ("5 years", once in the intro next to
 * the salary, once in the profile). Keep one per years value when neither names
 * a specific skill: the cleaner sentence wins. Removed duplicates leave the
 * candidate list too, so a model can't put them back.
 */
function dedupe(requirements: Requirement[], candidates: Requirement[]): Requirement[] {
  // Known skills only: capitalised words like a city ("Rennes") don't make a sentence specific.
  const skillful = (item: Requirement) => item.keywords.length > 0
  const byYears = new Map<number, Requirement[]>()
  for (const item of requirements) if (item.years !== null && !skillful(item)) byYears.set(item.years, [...(byYears.get(item.years) ?? []), item])
  const drop = new Set<string>()
  for (const group of byYears.values()) {
    if (group.length < 2) continue
    const best = [...group].sort((a, b) => Number(OFFER_NOISE.test(a.text)) - Number(OFFER_NOISE.test(b.text)) || a.text.length - b.text.length)[0]
    for (const item of group) if (item !== best) drop.add(item.id)
  }
  if (!drop.size) return requirements
  for (let index = candidates.length - 1; index >= 0; index -= 1) if (drop.has(candidates[index].id)) candidates.splice(index, 1)
  return requirements.filter((item) => !drop.has(item.id))
}

export function extractRequirements(rawText: string): Requirement[] {
  return extractRequirementCandidates(rawText).requirements
}

export type CoverLetterDecision = "required" | "optional" | "not_requested" | "not_mentioned"

/** Same four-way decision the my-cv workflow uses. */
export function coverLetterDecision(rawText: string): { decision: CoverLetterDecision; evidence: string } {
  const text = String(rawText ?? "")
  const find = (pattern: RegExp) => text.match(new RegExp(`[^.\\n]*${pattern.source}[^.\\n]*`, "i"))?.[0]?.trim() ?? ""
  const letter = /(cover letter|motivation letter|lettre de motivation|letter of motivation)/
  const negative = find(new RegExp(`(no|not required|without|pas de|sans|non requise?)[^.\\n]{0,30}${letter.source}|${letter.source}[^.\\n]{0,30}(not required|not necessary|non requise?|pas nécessaire|optional? not)`))
  if (negative && !/optional|facultative?/i.test(negative)) return { decision: "not_requested", evidence: negative }
  const optional = find(new RegExp(`${letter.source}[^.\\n]{0,40}(optional|facultative?|if you wish|si vous le souhaitez)|(optional|facultative?)[^.\\n]{0,40}${letter.source}`))
  if (optional) return { decision: "optional", evidence: optional }
  const mention = find(letter)
  if (mention) return { decision: "required", evidence: mention }
  return { decision: "not_mentioned", evidence: "" }
}
