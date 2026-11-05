/** Claim verification with the decision model: catches meaning-level invention the word checks miss. */
import { decideInChunks, noul, type Decide } from "./jev"

export type Claim = { id: string; text: string; evidence: string[] }
export const SUPPORT_THRESHOLD = 0.5

/** Probability (0–1) that each claim is fully supported by its own evidence. */
export async function verifyClaims(claims: Claim[], decide: Decide): Promise<Map<string, number>> {
  if (!claims.length) return new Map()
  const questions = Object.fromEntries(
    claims.map((claim, index) => [
      `c${index}`,
      noul(
        { task: "Is every statement in the claim supported by the evidence? Rewording is fine; added scope, seniority, ownership, tools, numbers or outcomes are not.", claim: claim.text, evidence: claim.evidence },
        { true: "Fully supported by the evidence", false: "Adds or exaggerates something the evidence does not state" },
      ),
    ]),
  )
  const result = await decideInChunks(decide, "Verify written claims against the candidate's own evidence.", questions, 80)
  return new Map(claims.map((claim, index) => {
    const answer = result.answers[`c${index}`]
    return [claim.id, answer?.type === "noul" ? answer.noul : 1]
  }))
}
