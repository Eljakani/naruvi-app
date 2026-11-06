"use client"

import { useTransition } from "react"
import { CheckIcon, Loader2Icon } from "lucide-react"
import { toast } from "sonner"
import { acceptMailSuggestionAction, dismissMailSuggestionAction } from "@/app/(app)/applications/actions"
import { Button } from "@/components/ui/button"

/** Apply or dismiss what an email suggests. Nothing changes until the person clicks. */
export function SuggestionActions({ messageId, label = "Apply" }: { messageId: string; label?: string }) {
  const [pending, startTransition] = useTransition()
  return (
    <div className="flex shrink-0 gap-1">
      <Button
        size="sm"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await acceptMailSuggestionAction(messageId)
            if (!result.ok) toast.error(result.message ?? "Couldn’t apply it")
            else toast.success("Updated from the email")
          })
        }
      >
        {pending ? <Loader2Icon className="animate-spin" /> : <CheckIcon />} {label}
      </Button>
      <Button size="sm" variant="ghost" disabled={pending} onClick={() => startTransition(async () => void (await dismissMailSuggestionAction(messageId)))}>
        Dismiss
      </Button>
    </div>
  )
}
