/** Keep explicit email requests out of document-generation tools, even when chat history contains cover letters. */
export function isEmailDraftRequest(text: string): boolean {
  const words = text.toLowerCase().normalize("NFKD").replace(/\p{M}/gu, "")
  const email = /\b(e-?mail|mail|courriel|correo|emailreply)\b/.test(words)
  const reply = /\b(reply|respond|response|repondre|reponse|responder|antwort|availability|disponibilite)\b/.test(words)
  const letter = /\b(cover letter|coverletter|lettre de motivation|anschreiben|carta de presentacion)\b/.test(words)
  return (email && (!letter || reply)) || (!letter && reply && /\b(draft|write|prepare|ecrire|rediger)\b/.test(words))
}
