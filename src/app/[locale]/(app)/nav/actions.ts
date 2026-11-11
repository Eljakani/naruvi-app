"use server"

import { navCounts } from "@/server/queries/nav-counts"

export async function navCountsAction() {
  return navCounts().catch(() => ({}) as Record<string, number>)
}
