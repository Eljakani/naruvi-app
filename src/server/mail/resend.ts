import "server-only"
import { setTimeout as wait } from "node:timers/promises"
import { z } from "zod"

const received = z.object({
  id: z.string().uuid(),
  from: z.string(),
  to: z.array(z.string()),
  cc: z.array(z.string()).nullish(),
  bcc: z.array(z.string()).nullish(),
  subject: z.string().nullish(),
  created_at: z.string().datetime({ offset: true }),
  message_id: z.string().nullish(),
})

export async function resendRequest(key: string, path: string, payload?: object) {
  const request = () => fetch(`https://api.resend.com${path}`, {
    method: payload ? "POST" : "GET",
    headers: { Authorization: `Bearer ${key}`, ...(payload ? { "Content-Type": "application/json" } : {}) },
    body: payload ? JSON.stringify(payload) : undefined,
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(15_000),
  })
  let response = await request()
  if (!payload && response.status === 429) {
    const delay = Math.max(1, Number(response.headers.get("retry-after")) || 1)
    await response.body?.cancel()
    await wait(Math.min(delay, 5) * 1000)
    response = await request()
  }
  const data: unknown = await response.json().catch(() => null)
  if (!response.ok) {
    const error = z.object({ message: z.string() }).safeParse(data)
    throw new Error(`Resend (${response.status}): ${error.success ? error.data.message.slice(0, 250) : "The request failed."}`)
  }
  return data
}

export async function listResendMail(key: string, after?: string) {
  const params = new URLSearchParams({ limit: "100" })
  if (after) params.set("after", after)
  return z.object({ data: z.array(received), has_more: z.boolean() }).parse(
    await resendRequest(key, `/emails/receiving?${params}`),
  )
}

export async function getResendMail(key: string, id: string) {
  return received.extend({
    text: z.string().nullish(),
    html: z.string().nullish(),
    headers: z.record(z.string(), z.string()).nullish(),
  }).parse(await resendRequest(key, `/emails/receiving/${encodeURIComponent(id)}?html_format=cid`))
}

export async function sendResendMail(key: string, payload: object) {
  const { id } = z.object({ id: z.string().uuid() }).parse(await resendRequest(key, "/emails", payload))
  // The provider owns Message-ID. A lookup failure must not turn a successful send into a retry.
  const sent = await resendRequest(key, `/emails/${id}`).catch(() => null)
  return z.object({ message_id: z.string().min(1) }).safeParse(sent).data?.message_id ?? `<${id}@resend.invalid>`
}
