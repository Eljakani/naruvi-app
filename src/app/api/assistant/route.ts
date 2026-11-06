import { z } from "zod"
import type { UIMessage } from "ai"
import { CHAT_IMAGE_BYTES, CHAT_IMAGE_HISTORY, CHAT_IMAGE_TYPES } from "@/lib/assistant-images"
import { streamAssistant } from "@/server/assistant/agent"

const body = z.object({ messages: z.array(z.any()).min(1).max(80), path: z.string().max(300).catch("/") })

/** Streams the assistant's reply. Same-origin JSON only: other sites can't drive it. */
export async function POST(request: Request) {
  const origin = request.headers.get("origin")
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host")
  if (!origin || !host || new URL(origin).host !== host || !request.headers.get("content-type")?.includes("application/json")) {
    return Response.json({ error: "Forbidden" }, { status: 403 })
  }
  const parsed = body.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return Response.json({ error: "Invalid request" }, { status: 400 })
  const messages = parsed.data.messages as UIMessage[]
  let images = 0
  for (const message of messages) {
    if (!Array.isArray(message?.parts)) return Response.json({ error: "Invalid message" }, { status: 400 })
    for (const part of message.parts) {
      if (part?.type !== "file") continue
      const prefix = `data:${part.mediaType};base64,`
      if (message.role !== "user" || !CHAT_IMAGE_TYPES.some((type) => type === part.mediaType) ||
          typeof part.url !== "string" || !part.url.startsWith(prefix) ||
          part.url.length > prefix.length + 4 * Math.ceil(CHAT_IMAGE_BYTES / 3) ||
          !/^[a-z0-9+/]+={0,2}$/i.test(part.url.slice(prefix.length)) || ++images > CHAT_IMAGE_HISTORY) {
        return Response.json({ error: "Attach one PNG, JPEG, or WebP image up to 2 MB." }, { status: 400 })
      }
    }
  }
  try {
    const result = await streamAssistant(messages, { path: parsed.data.path })
    return result.toUIMessageStreamResponse({
      onError: (error) => (error instanceof Error ? error.message : "The assistant ran into a problem. Try again."),
    })
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Couldn’t start the assistant." }, { status: 400 })
  }
}
