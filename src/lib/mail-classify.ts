/**
 * What a reply from a hiring team means, and what Naruvi suggests doing.
 * Pure. The decision model classifies when configured; these rules are the
 * fallback and cover English, French, German and Spanish.
 */
import { dueIn } from "./attention"
import type { Status } from "./stages"

export const MAIL_KINDS = {
  rejection: "The company declines the application or will not move forward",
  interview: "The company invites the candidate to an interview, call or test, or asks for availability",
  offer: "The company makes or announces a job offer",
  info_request: "The company asks the candidate to send information or documents",
  acknowledgement: "Automatic or short confirmation that the application was received",
  other: "Anything else (newsletter, unrelated update, marketing)",
} as const
export type MailKind = keyof typeof MAIL_KINDS

export const KIND_LABEL: Record<MailKind, string> = { rejection: "Rejection", interview: "Interview", offer: "Offer", info_request: "Asks for information", acknowledgement: "Received", other: "Other" }

const RULES: [MailKind, RegExp][] = [
  ["offer", /\b(pleased|happy|delighted) to (extend|make) (you )?an offer|\boffer letter\b|job offer|promesse d['’]embauche|proposition d['’]embauche|nous avons le plaisir de vous proposer le poste|freuen uns,? ihnen (ein|das) angebot|oferta de (empleo|trabajo)/i],
  ["rejection", /unfortunately|regret to inform|not (to )?(be )?mov(e|ing) forward|decided to (move forward|proceed|go ahead) with (other|another)|not been selected|position has been filled|will not be proceeding|malheureusement|pas (été )?retenu|ne (pas )?donner (une )?suite|ne pouvons (pas )?donner suite|autres? candidat|leider|absage|nicht berücksichtigen|lamentablemente|no ha(s)? sido seleccionad/i],
  ["interview", /\binterview|schedule (a|an) (call|chat|meeting)|your availability|availabilities|book a (time|slot)|calendly\.com|technical (test|assessment)|take-home|entretien|vos disponibilités|échange téléphonique|visio|vorstellungsgespräch|kennenlerngespräch|entrevista|disponibilidad/i],
  ["info_request", /could you (please )?(send|share|provide)|please (send|share|provide)|we (would )?need (your|a copy)|pourriez-vous (nous )?(envoyer|transmettre)|merci de nous (envoyer|transmettre)|könnten sie uns|podría enviarnos/i],
  ["acknowledgement", /received your application|thank(s| you) for (applying|your application|your interest)|application (has been|was) received|nous avons bien reçu|bien reçu votre candidature|candidature a bien été (reçue|enregistrée)|merci (pour|de) votre candidature|bewerbung (ist )?(eingegangen|erhalten)|vielen dank für ihre bewerbung|hemos recibido tu (solicitud|candidatura)|gracias por (tu|su) (solicitud|candidatura)/i],
]

/** Keyword fallback, strongest signal first (an offer email may also thank you for applying). */
export function ruleKind(subject: string, text: string): MailKind {
  const haystack = `${subject}\n${text.slice(0, 6000)}`
  return RULES.find(([, pattern]) => pattern.test(haystack))?.[0] ?? "other"
}

const PREPARING: Status[] = ["draft", "parsed", "analyzed", "generated", "ready"]
const ORDER: Status[] = ["draft", "parsed", "analyzed", "generated", "ready", "submitted", "interviewing", "offer"]

export type Suggestion = { status?: Status; nextStep?: string; nextStepDue?: string; summary: string }

/**
 * The change a reply suggests for an application, or null when nothing would
 * change. Never moves an application backwards or reopens a closed one.
 */
export function suggestFor(kind: MailKind, current: Status, company: string, now: number): Suggestion | null {
  const closed = current === "rejected" || current === "withdrawn"
  const before = (status: Status) => ORDER.indexOf(current) < ORDER.indexOf(status)
  const at = company || "The company"
  switch (kind) {
    case "rejection":
      return closed ? null : { status: "rejected", summary: `${at} declined. Mark it as rejected?` }
    case "interview":
      if (closed) return null
      return { ...(before("interviewing") ? { status: "interviewing" as const } : {}), nextStep: "Reply with your availability", nextStepDue: dueIn(1, now).toISOString(), summary: `${at} wants to talk. Move to Interviewing and reply?` }
    case "offer":
      if (closed) return null
      return { ...(before("offer") ? { status: "offer" as const } : {}), nextStep: "Answer the offer", nextStepDue: dueIn(3, now).toISOString(), summary: `${at} sent an offer.` }
    case "info_request":
      if (closed) return null
      return { ...(PREPARING.includes(current) ? { status: "submitted" as const } : {}), nextStep: "Send what they asked for", nextStepDue: dueIn(1, now).toISOString(), summary: `${at} asks for more information.` }
    case "acknowledgement":
      return PREPARING.includes(current) ? { status: "submitted", summary: `${at} confirmed it received your application. Mark it as sent?` } : null
    default:
      return null
  }
}
