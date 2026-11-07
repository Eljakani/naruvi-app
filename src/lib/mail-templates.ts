/**
 * Short, plain email drafts in the application's language. The person edits
 * them before sending; nothing here is sent on its own.
 */
export type ComposeKind = "apply" | "follow_up" | "thank_you" | "reply"
export const COMPOSE_LABEL: Record<ComposeKind, string> = { apply: "Send my application", follow_up: "Follow up", thank_you: "Thank you after an interview", reply: "Reply" }

type Input = { name: string; title: string; company: string; subject?: string; attachments?: { cv: boolean; letter: boolean } }
type Draft = { subject: string; body: string }
type Templates = Record<ComposeKind, (input: Input) => Draft>

const re = (subject: string | undefined, fallback: string, prefix = "Re: ") => (subject ? (/^(re|aw|réf|rv):/i.test(subject) ? subject : `${prefix}${subject}`) : fallback)

const TEMPLATES: Record<string, Templates> = {
  en: {
    apply: ({ name, title, company }) => ({ subject: `Application: ${title} – ${name}`, body: `Hello,\n\nPlease find attached my application for the ${title} position at ${company}: my CV and a cover letter.\n\nI would be glad to discuss how I could contribute to the team.\n\nKind regards,\n${name}` }),
    follow_up: ({ name, title, company, subject }) => ({ subject: re(subject, `Following up: ${title} application`), body: `Hello,\n\nI applied for the ${title} position at ${company} recently and wanted to check whether there is any news on my application. I remain very interested in the role.\n\nKind regards,\n${name}` }),
    thank_you: ({ name, title, subject }) => ({ subject: re(subject, `Thank you – ${title}`), body: `Hello,\n\nThank you for taking the time to speak with me about the ${title} role. I enjoyed our conversation and am even more interested in joining the team.\n\nKind regards,\n${name}` }),
    reply: ({ name, subject, title }) => ({ subject: re(subject, title), body: `Hello,\n\n\n\nKind regards,\n${name}` }),
  },
  fr: {
    apply: ({ name, title, company }) => ({ subject: `Candidature : ${title} – ${name}`, body: `Bonjour,\n\nVeuillez trouver ci-joint ma candidature au poste de ${title} chez ${company} : mon CV et une lettre de motivation.\n\nJe serais ravi(e) d’échanger avec vous sur ce que je pourrais apporter à l’équipe.\n\nBien cordialement,\n${name}` }),
    follow_up: ({ name, title, company, subject }) => ({ subject: re(subject, `Suivi de ma candidature : ${title}`), body: `Bonjour,\n\nJ’ai récemment postulé au poste de ${title} chez ${company} et je me permets de revenir vers vous pour savoir où en est ma candidature. Le poste m’intéresse toujours beaucoup.\n\nBien cordialement,\n${name}` }),
    thank_you: ({ name, title, subject }) => ({ subject: re(subject, `Merci – ${title}`), body: `Bonjour,\n\nMerci pour le temps que vous m’avez accordé au sujet du poste de ${title}. J’ai beaucoup apprécié notre échange, qui renforce mon envie de rejoindre l’équipe.\n\nBien cordialement,\n${name}` }),
    reply: ({ name, subject, title }) => ({ subject: re(subject, title), body: `Bonjour,\n\n\n\nBien cordialement,\n${name}` }),
  },
  de: {
    apply: ({ name, title, company }) => ({ subject: `Bewerbung: ${title} – ${name}`, body: `Guten Tag,\n\nanbei sende ich Ihnen meine Bewerbung für die Position ${title} bei ${company}: meinen Lebenslauf und ein Anschreiben.\n\nIch freue mich auf ein Gespräch.\n\nMit freundlichen Grüßen\n${name}` }),
    follow_up: ({ name, title, company, subject }) => ({ subject: re(subject, `Nachfrage zu meiner Bewerbung: ${title}`, "AW: "), body: `Guten Tag,\n\nich habe mich vor kurzem auf die Position ${title} bei ${company} beworben und wollte mich nach dem Stand meiner Bewerbung erkundigen. Die Stelle interessiert mich weiterhin sehr.\n\nMit freundlichen Grüßen\n${name}` }),
    thank_you: ({ name, title, subject }) => ({ subject: re(subject, `Vielen Dank – ${title}`, "AW: "), body: `Guten Tag,\n\nvielen Dank für das Gespräch über die Position ${title}. Es hat mein Interesse an der Stelle noch verstärkt.\n\nMit freundlichen Grüßen\n${name}` }),
    reply: ({ name, subject, title }) => ({ subject: re(subject, title, "AW: "), body: `Guten Tag,\n\n\n\nMit freundlichen Grüßen\n${name}` }),
  },
  es: {
    apply: ({ name, title, company }) => ({ subject: `Candidatura: ${title} – ${name}`, body: `Hola:\n\nAdjunto mi candidatura para el puesto de ${title} en ${company}: mi CV y una carta de presentación.\n\nEstaré encantado/a de hablar sobre cómo podría aportar al equipo.\n\nUn saludo,\n${name}` }),
    follow_up: ({ name, title, company, subject }) => ({ subject: re(subject, `Seguimiento de mi candidatura: ${title}`), body: `Hola:\n\nHace poco envié mi candidatura para el puesto de ${title} en ${company} y quería saber si hay novedades. Sigo muy interesado/a en el puesto.\n\nUn saludo,\n${name}` }),
    thank_you: ({ name, title, subject }) => ({ subject: re(subject, `Gracias – ${title}`), body: `Hola:\n\nGracias por su tiempo para hablar sobre el puesto de ${title}. Disfruté de la conversación y me interesa aún más unirme al equipo.\n\nUn saludo,\n${name}` }),
    reply: ({ name, subject, title }) => ({ subject: re(subject, title), body: `Hola:\n\n\n\nUn saludo,\n${name}` }),
  },
}

/** A draft in the given language; English when that language has no templates yet. */
export function composeDraft(kind: ComposeKind, language: string, input: Input): Draft {
  const draft = (TEMPLATES[language] ?? TEMPLATES.en)[kind](input)
  if (kind === "apply" && input.attachments) {
    const files = input.attachments
    const introductions: Record<string, string> = {
      en: `I am writing to apply for the ${input.title} position at ${input.company}.${files.cv || files.letter ? ` Please find attached ${[files.cv && "my CV", files.letter && "my cover letter"].filter(Boolean).join(" and ")}.` : ""}`,
      fr: `Je vous adresse ma candidature au poste de ${input.title} chez ${input.company}.${files.cv || files.letter ? ` Vous trouverez en pièce jointe ${[files.cv && "mon CV", files.letter && "ma lettre de motivation"].filter(Boolean).join(" et ")}.` : ""}`,
      de: `Hiermit bewerbe ich mich für die Position ${input.title} bei ${input.company}.${files.cv || files.letter ? ` Im Anhang finden Sie ${[files.cv && "meinen Lebenslauf", files.letter && "mein Anschreiben"].filter(Boolean).join(" und ")}.` : ""}`,
      es: `Le envío mi candidatura para el puesto de ${input.title} en ${input.company}.${files.cv || files.letter ? ` Adjunto ${[files.cv && "mi CV", files.letter && "mi carta de presentación"].filter(Boolean).join(" y ")}.` : ""}`,
    }
    const paragraphs = draft.body.split("\n\n")
    paragraphs[1] = introductions[language] ?? introductions.en
    draft.body = paragraphs.join("\n\n")
  }
  return draft
}

/** "a@x.com, B <b@y.org>" → ["a@x.com", "b@y.org"]; invalid entries dropped. */
export function parseAddresses(value: string): string[] {
  return value
    .split(/[,;\n]/)
    .map((part) => (part.match(/<([^>]+)>/)?.[1] ?? part).trim())
    .filter((address) => /^[^\s@<>()]+@[^\s@<>()]+\.[^\s@<>()]+$/.test(address))
    .slice(0, 10)
}
