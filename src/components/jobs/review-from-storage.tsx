"use client"

import { useSyncExternalStore } from "react"
import { DRAFT_KEY, type ReadResult } from "@/components/jobs/job-reader"
import { NewJobFlow } from "@/components/jobs/new-job-flow"

const subscribe = () => () => {}

/** The draft read in the Add-a-job dialog, handed over through this tab's session storage. */
export function ReviewFromStorage() {
  const raw = useSyncExternalStore(subscribe, () => sessionStorage.getItem(DRAFT_KEY), () => null)
  let initial: ReadResult | undefined
  try {
    initial = raw ? (JSON.parse(raw) as ReadResult) : undefined
  } catch {
    initial = undefined
  }
  return <NewJobFlow key={raw ? raw.length : "empty"} initial={initial} />
}
