"use client"

import { useTransition } from "react"
import { useRouter } from "next/navigation"
import { RefreshCwIcon } from "lucide-react"
import { Button } from "@/components/ui/button"

export function RefreshRuns() {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  return <Button variant="outline" size="sm" disabled={pending} onClick={() => startTransition(() => router.refresh())}><RefreshCwIcon className={pending ? "animate-spin" : ""} /> Refresh</Button>
}
