import type { UIMessage } from "ai"

export const CHAT_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"] as const
export const CHAT_IMAGE_BYTES = 2 * 1024 * 1024
export const CHAT_IMAGE_HISTORY = 1

/** Keep the most recent image in requests and session storage. */
export function limitChatImages(messages: UIMessage[]): UIMessage[] {
  let remaining = CHAT_IMAGE_HISTORY
  return [...messages].reverse().map((message) => ({
    ...message,
    parts: [...message.parts].reverse().map((part): UIMessage["parts"][number] => {
      if (part.type !== "file") return part
      if (remaining-- > 0) return part
      return { type: "text", text: "[Earlier image attachment]" }
    }).reverse(),
  })).reverse()
}
