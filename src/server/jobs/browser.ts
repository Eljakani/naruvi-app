import "server-only"
import { chromium } from "playwright"
import { assertPublicUrl, safeFetch } from "@/server/assets/safe-fetch"
import { needsBrowser, type JobPage } from "./url-source"
import { parseSource } from "./select"

const MAX_HTML_BYTES = 3 * 1024 * 1024
const TIMEOUT_MS = 25_000
let activeBrowsers = 0

/** Isolated, read-only rendering. All HTTP traffic goes through our bounded public-URL fetcher. */
export async function renderJobPage(rawUrl: string, fetchResource = safeFetch): Promise<JobPage> {
  await assertPublicUrl(new URL(rawUrl))
  if (activeBrowsers >= 2) throw new Error("Job readers are busy. Try again shortly or paste the job text.")
  activeBrowsers += 1
  try {
    const browser = await chromium.launch({ headless: true, timeout: 10_000 })
    const deadline = Date.now() + TIMEOUT_MS
    const timer = setTimeout(() => { void browser.close().catch(() => {}) }, TIMEOUT_MS)
    try {
      const context = await browser.newContext({ serviceWorkers: "block", acceptDownloads: false, locale: "en-US" })
      let requests = 0
      let bytes = 0
      await context.routeWebSocket("**/*", (socket) => socket.close())
      await context.route("**/*", async (route) => {
        try {
          const request = route.request()
          if (request.method() !== "GET" || ["image", "media", "font"].includes(request.resourceType()) ||
              ++requests > 100 || bytes >= 24 * 1024 * 1024 || Date.now() >= deadline) {
            await route.abort()
            return
          }
          // Check subresources, frames, and redirects too. Never route.continue():
          // Chromium must not bypass the fetcher's redirect and response limits.
          await assertPublicUrl(new URL(request.url()))
          const result = await fetchResource(request.url(), {
            maxBytes: MAX_HTML_BYTES,
            accept: request.headers().accept || "*/*",
            origin: request.headers().origin,
            timeoutMs: Math.max(1, Math.min(10_000, deadline - Date.now())),
          })
          bytes += result.buffer.length
          if (bytes > 24 * 1024 * 1024) { await route.abort(); return }
          if (new URL(result.finalUrl).href !== new URL(request.url()).href) {
            await route.fulfill({ status: 302, headers: { location: result.finalUrl }, body: "" })
          } else {
            await route.fulfill({ status: result.status, headers: result.headers, contentType: result.contentType || "application/octet-stream", body: result.buffer })
          }
        } catch {
          await route.abort().catch(() => {})
        }
      })
      const page = await context.newPage()
      page.on("dialog", (dialog) => { void dialog.dismiss().catch(() => {}) })
      context.on("page", (opened) => { if (opened !== page) void opened.close().catch(() => {}) })
      const response = await page.goto(rawUrl, { waitUntil: "domcontentloaded", timeout: 15_000 })
      if (!response || response.status() >= 400) throw new Error(`The rendered page answered ${response?.status() ?? "no response"}.`)

      // Poll the parsed content rather than networkidle: analytics may never go idle,
      // while client-side job data can arrive after DOMContentLoaded.
      const waitUntil = Math.min(deadline - 1000, Date.now() + 8_000)
      let previous = ""
      let html = ""
      while (Date.now() < waitUntil) {
        html = await page.content()
        if (Buffer.byteLength(html) > MAX_HTML_BYTES) throw new Error("The rendered page is too large.")
        const job = parseSource("page", html, "text/html", rawUrl, page.url())
        if (!needsBrowser(job) && job.description === previous) break
        previous = job.description
        await page.waitForTimeout(400)
      }
      await assertPublicUrl(new URL(page.url()))
      return { html, finalUrl: page.url() }
    } finally {
      clearTimeout(timer)
      await browser.close()
    }
  } catch (error) {
    if (error instanceof Error && /executable doesn't exist/i.test(error.message)) {
      throw new Error("Chromium is not installed. Run npm run browser:install, then try again.")
    }
    throw error
  } finally {
    activeBrowsers -= 1
  }
}
