/**
 * Suggestions for "Describe what you want" that fit the design as it is now:
 * no "two columns" when it already has two, no "centre the header" when it is
 * centred. Deterministic per design and per round, so they change as you go.
 */
import { FONTS, type DesignTokens } from "./design"

type Idea = { text: string; weight: number }

const COLOURS = [
  { name: "navy", hex: "#1e3a5f" },
  { name: "dark green", hex: "#14532d" },
  { name: "burgundy", hex: "#7f1d1d" },
  { name: "teal", hex: "#0f766e" },
  { name: "deep purple", hex: "#4c1d95" },
  { name: "charcoal", hex: "#1f2937" },
]

export function designIdeas(tokens: DesignTokens, context: { pages?: number; seed?: number; exclude?: string[] } = {}): string[] {
  const ideas: Idea[] = []
  const add = (text: string, weight = 1) => ideas.push({ text, weight })
  const serif = FONTS[tokens.font]?.kind === "serif"

  if ((context.pages ?? 1) > 1) add("Make it fit on one page", 5)
  else add("Add a little more breathing room", 1.5)
  if (tokens.layout === "single") add("Two columns with skills on the side", 2)
  else {
    add(tokens.sidebarSide === "left" ? "Move the side column to the right" : "Move the side column to the left", 1.5)
    if (!tokens.sidebarTint) add("Give the side column a soft tint", 1.5)
    add("Back to a single column", 0.8)
  }
  add(tokens.headerAlign === "left" ? "Bigger name, centred header" : "Left-aligned header, cleaner look", 1.4)
  add(serif ? "Switch to a clean modern sans font" : "Try an elegant serif font", 1.3)
  const current = COLOURS.find((colour) => colour.hex.toLowerCase() === tokens.accent.toLowerCase())
  const others = COLOURS.filter((colour) => colour !== current)
  const colour = others[(context.seed ?? 0) % others.length]
  add(`Use a ${colour.name} accent`, 1.2)
  if (tokens.skillsStyle !== "tags") add("Show skills as tags", 1.2)
  if (!tokens.headerBand) add("Add a coloured band behind my name", 0.9)
  if (tokens.headingStyle === "plain" || tokens.headingStyle === "rule") add("Bolder section headings", 1.1)
  else add("Quieter, more minimal headings", 1.1)
  if (tokens.spacing > 1.15) add("Make it more compact", 1)
  if (tokens.size < 9.2) add("Make the text a bit larger", 1.2)
  if (!tokens.accentHeadings && !tokens.accentName) add("Add a touch of colour to headings", 1)
  if (tokens.accentHeadings || tokens.accentName || tokens.headerBand) add("More elegant and minimal", 1)
  if (tokens.photoShape === "circle") add("Square photo, sharper look", 0.6)
  if (!tokens.pageNumbers && (context.pages ?? 1) > 1) add("Add page numbers", 0.8)

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
