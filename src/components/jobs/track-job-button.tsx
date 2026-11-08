"use client"

import { useRouter } from "next/navigation"
import { BookmarkPlusIcon } from "lucide-react"
import { toast } from "sonner"
import { trackJobAction } from "@/app/(app)/jobs/actions"
import ParticleButton from "@/components/kokonutui/particle-button"

/** Move a posting from Jobs into Applications, at "Saved", without analyzing it yet. */
export function TrackJobButton({ jobId }: { jobId: string }) {
  const router = useRouter()
  return (
    <ParticleButton
      variant="outline"
      pendingLabel="Saving"
      successLabel="Tracked"
      onClick={async () => {
        const result = await trackJobAction(jobId)
        if (!result.ok) {
          toast.error(result.error)
          throw new Error(result.error)
        }
        router.push(`/applications/${result.data.applicationId}?tab=overview`)
      }}
    >
      <BookmarkPlusIcon /> Track it
    </ParticleButton>
  )
}
