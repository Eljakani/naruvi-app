"use client"

import { useRouter } from "next/navigation"
import { BookmarkPlusIcon } from "lucide-react"
import { toast } from "sonner"
import { trackJobAction } from "@/app/[locale]/(app)/jobs/actions"
import ParticleButton from "@/components/kokonutui/particle-button"
import { useTranslations } from "next-intl"

/** Move a posting from Jobs into Applications, at "Saved", without analyzing it yet. */
export function TrackJobButton({ jobId }: { jobId: string }) {
  const t = useTranslations("jobs.track")
  const router = useRouter()
  return (
    <ParticleButton
      variant="outline"
      pendingLabel={t("saving")}
      successLabel={t("tracked")}
      onClick={async () => {
        const result = await trackJobAction(jobId)
        if (!result.ok) {
          toast.error(result.error)
          throw new Error(result.error)
        }
        router.push(`/applications/${result.data.applicationId}?tab=overview`)
      }}
    >
      <BookmarkPlusIcon /> {t("track")}
    </ParticleButton>
  )
}
