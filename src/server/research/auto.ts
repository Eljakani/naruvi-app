import "server-only"
import { after } from "next/server"
import { researchForJob } from "./service"

/** Jobs being researched right now (one Node process; enough for a local app). */
const running = new Set<string>()

export const isResearching = (jobId: string) => running.has(jobId)

/**
 * Starts company research after the response is sent, so it's ready by the
 * time the person opens the application. Cached for a week; never throws.
 */
export function scheduleResearch(jobId: string) {
  if (running.has(jobId)) return
  running.add(jobId)
  after(async () => {
    try {
      await researchForJob(jobId)
    } catch {
      // Research is optional; the manual button still works.
    } finally {
      running.delete(jobId)
    }
  })
}
