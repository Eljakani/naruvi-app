import { api } from "@/server/integrations/api"
import { getDashboard } from "@/server/queries/dashboard"

/** What needs doing: new replies, due next steps, ready documents, quiet applications, upcoming steps. */
export const GET = api(async () => {
  const data = await getDashboard()
  return {
    replies: data.replies.map((reply) => ({ applicationId: reply.applicationId, title: reply.title, company: reply.company, subject: reply.subject, from: reply.fromName || reply.fromAddress, kind: reply.kind, suggestion: reply.suggestion?.summary ?? null })),
    todo: data.attention.map((item) => ({ applicationId: item.id, title: item.title, company: item.company, reason: item.reason, message: item.message })),
    upcoming: data.upcoming.map((item) => ({ applicationId: item.id, title: item.title, company: item.company, nextStep: item.nextStep, due: item.due.toISOString() })),
  }
})
