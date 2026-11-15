/**
 * What a design means in practice, worked out from its tokens alone: how well
 * applicant tracking systems (ATS) read it, and how dense it is. Pure, so the
 * gallery, the pickers and the AI design director all say the same thing.
 */
import type { DesignTokens } from "./design"

export type AtsLevel = "high" | "good" | "fair"
/** Why a design is not at the top ATS level; message keys under `designInsights.reasons`. */
export type AtsReason = "columns" | "timeline" | "split" | "labels" | "small"
export type Density = "compact" | "balanced" | "airy"
export type DesignInsights = { ats: AtsLevel; atsScore: number; reasons: AtsReason[]; density: Density }

export function designInsights(t: DesignTokens): DesignInsights {
  const reasons: AtsReason[] = []
  let score = 100
  // Every layout is real text; what varies is the order a parser reads it in.
  if (t.layout === "sidebar") { score -= 25; reasons.push("columns") }
  if (t.entryLayout === "timeline") { score -= 10; reasons.push("timeline") }
  if (t.headerLayout === "split" && t.headerAlign !== "center") { score -= 5; reasons.push("split") }
  if (t.linkStyle === "label") { score -= 5; reasons.push("labels") }
  if (t.size < 9) { score -= 5; reasons.push("small") }
  const body = t.size * t.lineHeight * (0.6 + 0.4 * t.spacing) * (0.8 + 0.2 * t.itemSpacing)
  const density: Density = body < 11.9 || t.margin <= 28 ? "compact" : body > 14.8 || t.margin >= 46 ? "airy" : "balanced"
  return { ats: score >= 90 ? "high" : score >= 70 ? "good" : "fair", atsScore: score, reasons, density }
}
