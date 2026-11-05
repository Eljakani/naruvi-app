"use client"

import { useTransition } from "react"
import { ChevronDownIcon, Loader2Icon } from "lucide-react"
import { toast } from "sonner"
import { moveApplicationAction } from "@/app/(app)/applications/actions"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { MANUAL_STATUSES, STATUS_LABEL, type Status } from "@/lib/stages"

/** Current status with a menu to set it by hand. */
export function StatusControl({ id, status }: { id: string; status: Status }) {
  const [pending, startTransition] = useTransition()
  const options = MANUAL_STATUSES.includes(status) ? MANUAL_STATUSES : [status, ...MANUAL_STATUSES]
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="outline" disabled={pending} />}>
        {pending ? <Loader2Icon className="animate-spin" /> : null} {STATUS_LABEL[status]} <ChevronDownIcon />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Status</DropdownMenuLabel>
          <DropdownMenuRadioGroup
            value={status}
            onValueChange={(value) =>
              startTransition(async () => {
                const result = await moveApplicationAction(id, value as string)
                if (!result.ok) toast.error(result.message ?? "Couldn’t update the status")
              })
            }
          >
            {options.map((option) => (
              <DropdownMenuRadioItem key={option} value={option}>
                {STATUS_LABEL[option]}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
