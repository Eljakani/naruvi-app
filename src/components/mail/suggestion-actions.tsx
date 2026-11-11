"use client"

import { useTransition } from "react"
import { CheckIcon, Loader2Icon } from "lucide-react"
import { toast } from "sonner"
import { acceptMailSuggestionAction, dismissMailSuggestionAction } from "@/app/[locale]/(app)/applications/actions"
import { Button } from "@/components/ui/button"
import { useTranslations } from "next-intl"

/** Apply or dismiss what an email suggests. Nothing changes until the person clicks. */
export function SuggestionActions({ messageId, label }: { messageId: string; label?: string }) {
  const t = useTranslations("mail")
  const [pending, startTransition] = useTransition()
  return (
    <div className="flex shrink-0 gap-1">
      <Button
        size="sm"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await acceptMailSuggestionAction(messageId)
            if (!result.ok) toast.error(result.message ?? t("applyFailed"))
            else toast.success(t("updatedFromEmail"))
          })
        }
      >
        {pending ? <Loader2Icon className="animate-spin" /> : <CheckIcon />} {label ?? t("apply")}
      </Button>
      <Button size="sm" variant="ghost" disabled={pending} onClick={() => startTransition(async () => void (await dismissMailSuggestionAction(messageId)))}>
        {t("dismiss")}
      </Button>
    </div>
  )
}
