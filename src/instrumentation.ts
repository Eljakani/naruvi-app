/**
 * Background work for a locally running Naruvi: check the connected mailbox
 * every few minutes. Runs only in the Node.js server, once per process.
 * Set NARUVI_BACKGROUND=off to disable (for example when a separate worker does it).
 */
const EVERY_MS = 5 * 60_000

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return
  if (process.env.NARUVI_TRUST_PROXY === "on") console.warn("[Naruvi] NARUVI_TRUST_PROXY is on — X-Naruvi-Client-IP is trusted for rate-limit bucketing. Only enable this behind a gateway that overwrites the header.")
  if (process.env.NODE_ENV === "production" && (!process.env.NARUVI_URL || !process.env.NARUVI_URL.startsWith("https://"))) console.warn("[Naruvi] NARUVI_URL is not set to an https:// address. Set it before exposing to the internet.")
  const { printSetupLink } = await import("@/server/auth/store")
  await printSetupLink()
  if (process.env.NARUVI_BACKGROUND === "off") return
  const state = globalThis as unknown as { naruviBackground?: ReturnType<typeof setInterval> }
  if (state.naruviBackground) return
  const tick = async () => {
    try {
      const { runBackgroundTasks } = await import("@/server/background")
      await runBackgroundTasks()
    } catch (error) {
      console.error("[naruvi] background task failed:", error instanceof Error ? error.message : error)
    }
  }
  state.naruviBackground = setInterval(tick, EVERY_MS)
  setTimeout(tick, 20_000)
}
