import type { UIMessage } from "ai"

export const CHAT_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"] as const
export const CHAT_IMAGE_BYTES = 2 * 1024 * 1024
/** Images one message can carry. */
export const CHAT_IMAGE_MAX = 4

/**
 * Only the latest message with images keeps them (up to CHAT_IMAGE_MAX), in
 * requests and session storage; older ones become a short placeholder.
 */
export function limitChatImages(messages: UIMessage[]): UIMessage[] {
  const latest = [...messages].reverse().find((message) => message.parts.some((part) => part.type === "file"))
  return messages.map((message) => {
    let kept = 0
    return {
      ...message,
      parts: message.parts.map((part): UIMessage["parts"][number] => {
        if (part.type !== "file") return part
        if (message === latest && kept++ < CHAT_IMAGE_MAX) return part
        return { type: "text", text: "[Earlier image attachment]" }
      }),
    }
  })
}
