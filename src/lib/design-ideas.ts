/**
 * Suggestions for "Describe what you want" that fit the design as it is now:
 * no "two columns" when it already has two, no "centre the header" when it is
 * centred. Deterministic per design and per round, so they change as you go.
 */
import { FONTS, type DesignTokens } from "./design"

type Idea = { key: string; text: string; weight: number; values?: Record<string, string> }
/** Words for a suggestion: the UI passes its translator (`designIdeas.*`); English otherwise. */
export type IdeaWords = (key: string, values?: Record<string, string>) => string

const COLOURS = [
  { name: "navy", hex: "#1e3a5f" },
  { name: "dark green", hex: "#14532d" },
  { name: "burgundy", hex: "#7f1d1d" },
  { name: "teal", hex: "#0f766e" },
  { name: "deep purple", hex: "#4c1d95" },
  { name: "charcoal", hex: "#1f2937" },
]

export function designIdeas(tokens: DesignTokens, context: { pages?: number; seed?: number; exclude?: string[] } = {}, words?: IdeaWords): string[] {
  const ideas: Idea[] = []
  const add = (key: string, text: string, weight = 1, values?: Record<string, string>) => ideas.push({ key, text: words ? words(key, values) : text, weight, values })
  const serif = FONTS[tokens.font]?.kind === "serif"

  if ((context.pages ?? 1) > 1) add("makeItFitOnOnePage", "Make it fit on one page", 5)
  else add("addALittleMoreBreathingRoom", "Add a little more breathing room", 1.5)
  if (tokens.layout === "single") add("twoColumnsWithSkillsOnTheSide", "Two columns with skills on the side", 2)
  else {
    add(tokens.sidebarSide === "left" ? "sideRight" : "sideLeft", tokens.sidebarSide === "left" ? "Move the side column to the right" : "Move the side column to the left", 1.5)
    if (!tokens.sidebarTint) add("giveTheSideColumnASoftTint", "Give the side column a soft tint", 1.5)
    add("backToASingleColumn", "Back to a single column", 0.8)
  }
  add(tokens.headerAlign === "left" ? "centreHeader" : "leftHeader", tokens.headerAlign === "left" ? "Bigger name, centred header" : "Left-aligned header, cleaner look", 1.4)
  add(serif ? "sans" : "serif", serif ? "Switch to a clean modern sans font" : "Try an elegant serif font", 1.3)
  const current = COLOURS.find((colour) => colour.hex.toLowerCase() === tokens.accent.toLowerCase())
  const others = COLOURS.filter((colour) => colour !== current)
  const colour = others[(context.seed ?? 0) % others.length]
  add("accent", `Use a ${colour.name} accent`, 1.2, { colour: words ? words(`colours.${colour.name.replace(" ", "_")}`) : colour.name })
  if (tokens.skillsStyle !== "tags") add("showSkillsAsTags", "Show skills as tags", 1.2)
  if (!tokens.headerBand) add("addAColouredBandBehindMyName", "Add a coloured band behind my name", 0.9)
  if (tokens.headingStyle === "plain" || tokens.headingStyle === "rule") add("bolderSectionHeadings", "Bolder section headings", 1.1)
  else add("quieterMoreMinimalHeadings", "Quieter, more minimal headings", 1.1)
  if (tokens.spacing > 1.15) add("makeItMoreCompact", "Make it more compact", 1)
  if (tokens.size < 9.2) add("makeTheTextABitLarger", "Make the text a bit larger", 1.2)
  if (!tokens.accentHeadings && !tokens.accentName) add("addATouchOfColourToHeadings", "Add a touch of colour to headings", 1)
  if (tokens.accentHeadings || tokens.accentName || tokens.headerBand) add("moreElegantAndMinimal", "More elegant and minimal", 1)
  if (tokens.photoShape === "circle") add("squarePhotoSharperLook", "Square photo, sharper look", 0.6)
  if (!tokens.pageNumbers && (context.pages ?? 1) > 1) add("addPageNumbers", "Add page numbers", 0.8)

  // Stable shuffle: weight, then a seeded tiebreak so the set rotates between requests.
  const seed = context.seed ?? 0
  const score = (idea: Idea, index: number) => idea.weight + (((index * 7919 + seed * 104729) % 97) / 97) * 1.2
  return ideas
    .map((idea, index) => ({ idea, score: score(idea, index) }))
    .filter(({ idea }) => !(context.exclude ?? []).includes(idea.text))
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map(({ idea }) => idea.text)
}
