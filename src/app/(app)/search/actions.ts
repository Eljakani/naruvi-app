"use server"

import { z } from "zod"
import { quickSearch } from "@/server/jobs/search"

/** Jobs and companies for the command menu (Ctrl/⌘ K). */
export async function quickSearchAction(q: string) {
  const parsed = z.string().max(200).safeParse(q)
  if (!parsed.success || !parsed.data.trim()) return { jobs: [], companies: [] }
  return quickSearch(parsed.data)
}
