/**
 * Turn what someone typed into a Postgres tsquery for the "simple" search
 * configuration: every word must appear, each one as a prefix ("secu" finds
 * "security"). Letters and digits from any script are kept; everything else
 * is dropped, so the result is always safe to pass to to_tsquery.
 */
export function prefixQuery(input: string): string | null {
  const words = input
    .toLowerCase()
    .normalize("NFC")
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)
    .slice(0, 8)
  return words.length ? words.map((word) => `${word}:*`).join(" & ") : null
}

/** Escape a term for a SQL LIKE pattern (used for company names). */
export const likePattern = (input: string) => `%${input.trim().replace(/[\\%_]/g, (c) => `\\${c}`)}%`
