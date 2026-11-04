/** Match an organization name to logo files by name. Pure. */

const NOISE = new Set(["logo", "logos", "new", "mark", "icon", "square", "the", "and", "de", "of", "group", "groupe", "services", "research", "development", "inc", "sa", "sas"])

function words(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\.[a-z0-9]+$/, "")
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length > 1 && !NOISE.has(word))
}

export type LogoCandidate = { file: string; aspect: number | null }

/**
 * Best logo file for an organization, or null. A file matches when all of its
 * meaningful words appear in the organization name; among matches, the most
 * square image wins, then an explicit "mark", then the shorter name.
 */
export function matchLogo(organization: string, candidates: LogoCandidate[]): string | null {
  const org = new Set(words(organization))
  if (!org.size) return null
  const scored = candidates
    .map((candidate) => {
      const name = candidate.file.split("/").pop() ?? candidate.file
      const fileWords = words(name)
      if (!fileWords.length || !fileWords.every((word) => org.has(word))) return null
      const squareness = candidate.aspect ? Math.min(candidate.aspect, 1 / candidate.aspect) : 0.5
      return { file: candidate.file, score: fileWords.length * 10 + squareness * 8 + (/mark/i.test(name) ? 2 : 0) - name.length / 100 }
    })
    .filter((item): item is { file: string; score: number } => item !== null)
    .sort((a, b) => b.score - a.score)
  return scored[0]?.file ?? null
}
