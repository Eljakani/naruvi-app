"use client"

import { useTransition } from "react"
import { ChevronDownIcon, Loader2Icon } from "lucide-react"
import { toast } from "sonner"
import { announceStatus } from "@/components/naruvi/moments"
import { moveApplicationAction } from "@/app/[locale]/(app)/applications/actions"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { MANUAL_STATUSES, type Status } from "@/lib/stages"
import { useTranslations } from "next-intl"

/** Current status with a menu to set it by hand. */
export function StatusControl({ id, status, company = "", title = "" }: { id: string; status: Status; company?: string; title?: string }) {
  const [pending, startTransition] = useTransition()
  const options = MANUAL_STATUSES.includes(status) ? MANUAL_STATUSES : [status, ...MANUAL_STATUSES]
  const t = useTranslations("board")
  const tl = useTranslations("labels")
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="outline" disabled={pending} />}>
        {pending ? <Loader2Icon className="animate-spin" /> : null} {tl(`status.${status}`)} <ChevronDownIcon />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuGroup>
          <DropdownMenuLabel>{t("status")}</DropdownMenuLabel>
          <DropdownMenuRadioGroup
            value={status}
            onValueChange={(value) =>
              startTransition(async () => {
                const result = await moveApplicationAction(id, value as string)
                if (!result.ok) toast.error(result.message ?? t("statusFailed"))
                else announceStatus(value as Status, company, title)
              })
            }
          >
            {options.map((option) => (
              <DropdownMenuRadioItem key={option} value={option}>
                {tl(`status.${option}`)}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** One-click status move for the "next step" panel, e.g. "Mark as sent". */
export function MoveStatusButton({ id, to, company = "", title = "", variant = "default", children }: { id: string; to: Status; company?: string; title?: string; variant?: "default" | "outline"; children: React.ReactNode }) {
  const [pending, startTransition] = useTransition()
  const t = useTranslations("board")
  return (
    <Button
      variant={variant}
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await moveApplicationAction(id, to)
          if (!result.ok) toast.error(result.message ?? t("statusFailed"))
          else announceStatus(to, company, title)
        })
      }
    >
      {pending ? <Loader2Icon className="animate-spin" /> : null}
      {children}
    </Button>
  )
}
