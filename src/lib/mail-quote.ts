/**
 * Split an email into what was written now and the earlier messages quoted
 * below it ("On Mon, … wrote:", "Le sam. 7 nov. … a écrit :", "> …"), so a
 * conversation shows each message once.
 */
const MARKERS = [
  /(?:^|\n)[^\S\n]*On [^\n]{4,200}?wrote:\s*(?:\n|$)/i,
  /(?:^|\n|\s)Le [^\n]{4,200}?\n?[^\S\n]*a écrit\s*:/i,
  /(?:^|\n)[^\S\n]*-{2,}\s*(?:Original Message|Message d'origine|Forwarded message)\s*-{2,}/i,
  /(?:^|\n)[^\S\n]*(?:From|De)\s*:[^\n]+\n[^\S\n]*(?:Sent|Envoyé|Date)\s*:/i,
  /(?:^|\n)(?:>[^\n]*(?:\n|$)){2,}/,
]

export function splitQuoted(text: string): { body: string; quoted: string } {
  let cut = -1
  for (const marker of MARKERS) {
    const match = marker.exec(text)
    if (match && (cut === -1 || match.index < cut)) cut = match.index
  }
  // Never hide the whole message: a reply that is only a quote stays visible.
  if (cut <= 0 || !text.slice(0, cut).trim()) return { body: text.trim(), quoted: "" }
  return { body: text.slice(0, cut).trim(), quoted: text.slice(cut).trim() }
}
