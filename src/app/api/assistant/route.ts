import { cookies } from "next/headers"
import { LOCALE_COOKIE, pickLocale } from "@/i18n/config"
import { workBudget, budgetedStream } from "@/server/auth/work-budget"
import { z } from "zod"
import type { UIMessage } from "ai"
import { CHAT_IMAGE_BYTES, CHAT_IMAGE_MAX, CHAT_IMAGE_TYPES } from "@/lib/assistant-images"
import { streamAssistant } from "@/server/assistant/agent"

const body = z.object({ messages: z.array(z.any()).min(1).max(80), path: z.string().max(300).catch("/") })

/** Streams the assistant's reply. Same-origin JSON only: other sites can't drive it. */
export async function POST(request: Request) {
  const budget = await workBudget(request, "assistant")
  if (budget.response) return budget.response
  const abort = new AbortController()
  let streaming = false
  try {
    const parsed = body.safeParse(await budget.request!.json().catch(() => null))
    if (!parsed.success) return Response.json({ error: "Invalid request" }, { status: 400 })
    const messages = parsed.data.messages as UIMessage[]
    let images = 0
    let contextBytes = 0
    for (const message of messages) {
      if (!Array.isArray(message?.parts)) return Response.json({ error: "Invalid message" }, { status: 400 })
      if (!message.parts.every(part => part?.type !== "text" || typeof part.text === "string" && part.text.length <= 20_000)) return Response.json({ error: "Message text is too long." }, { status: 400 })
      for (const part of message.parts) {
        if (part?.type !== "file") {
          contextBytes += Buffer.byteLength(JSON.stringify(part))
          if (contextBytes > 256 * 1024) return Response.json({ error: "This conversation is too large. Start a new chat or shorten the message." }, { status: 413 })
          continue
        }
        const prefix = `data:${part.mediaType};base64,`
        if (message.role !== "user" || !CHAT_IMAGE_TYPES.some((type) => type === part.mediaType) ||
            typeof part.url !== "string" || !part.url.startsWith(prefix) ||
            part.url.length > prefix.length + 4 * Math.ceil(CHAT_IMAGE_BYTES / 3) ||
            !/^[a-z0-9+/]+={0,2}$/i.test(part.url.slice(prefix.length)) || ++images > CHAT_IMAGE_MAX) {
          return Response.json({ error: `Attach up to ${CHAT_IMAGE_MAX} PNG, JPEG or WebP images, 2 MB each.` }, { status: 400 })
        }
      }
    }
    try {
      const locale = pickLocale((await cookies()).get(LOCALE_COOKIE)?.value, request.headers.get("accept-language"))
      const result = await streamAssistant(messages, { locale, path: parsed.data.path, signal: AbortSignal.any([request.signal, abort.signal]) })
      const response = result.toUIMessageStreamResponse({
        onError: (error) => (error instanceof Error ? error.message : "The assistant ran into a problem. Try again."),
      })
      streaming = true
      return budgetedStream(response, budget.release!, abort)
    } catch (error) {
      return Response.json({ error: error instanceof Error ? error.message : "Couldn’t start the assistant." }, { status: 400 })
    }
  } finally { if (!streaming) { abort.abort(); await budget.release!() } }
}
