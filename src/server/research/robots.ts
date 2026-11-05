/**
 * robots.txt check for the "*" user agent, with the standard wildcard rules:
 * "*" matches any sequence, a trailing "$" anchors the end, and the longest
 * matching rule wins (Allow wins ties). Pure.
 */
function toRegex(pattern: string) {
  const anchored = pattern.endsWith("$")
  const body = (anchored ? pattern.slice(0, -1) : pattern).replace(/[.+?^{}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*")
  return new RegExp(`^${body}${anchored ? "$" : ""}`)
}

export function robotsAllows(robots: string, path: string): boolean {
  const lines = String(robots ?? "").split(/\r?\n/).map((line) => line.replace(/#.*/, "").trim())
  const rules: { allow: boolean; pattern: string }[] = []
  let inStar = false
  let lastWasAgent = false
  for (const line of lines) {
    const colon = line.indexOf(":")
    if (colon < 0) continue
    const key = line.slice(0, colon).trim().toLowerCase()
    const value = line.slice(colon + 1).trim()
    if (key === "user-agent") {
      // Consecutive User-agent lines form one group.
      inStar = lastWasAgent ? inStar || value === "*" : value === "*"
      lastWasAgent = true
      continue
    }
    lastWasAgent = false
    if (inStar && (key === "allow" || key === "disallow") && value) rules.push({ allow: key === "allow", pattern: value })
  }
  let best: { allow: boolean; length: number } | null = null
  for (const rule of rules) {
    if (!toRegex(rule.pattern).test(path)) continue
    const length = rule.pattern.replace(/\*/g, "").length
    if (!best || length > best.length || (length === best.length && rule.allow)) best = { allow: rule.allow, length }
  }
  return best ? best.allow : true
}
