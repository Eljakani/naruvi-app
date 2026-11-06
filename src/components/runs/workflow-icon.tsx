import { ActivityIcon, InboxIcon, Building2Icon, DownloadIcon, FileTextIcon, FlaskConicalIcon, GaugeIcon, MailIcon, PaletteIcon, SparklesIcon, UserIcon, type LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"

const ICONS: [RegExp, LucideIcon][] = [
  [/^application\./, GaugeIcon],
  [/^company\./, Building2Icon],
  [/^cv\./, FileTextIcon],
  [/^letter\./, MailIcon],
  [/^mail\./, InboxIcon],
  [/^job\.preview/, DownloadIcon],
  [/^job\./, SparklesIcon],
  [/^profile\./, UserIcon],
  [/^template\./, PaletteIcon],
  [/^ai\.sdk\./, FlaskConicalIcon],
]

export function WorkflowIcon({ workflow, className }: { workflow: string; className?: string }) {
  const Icon = ICONS.find(([pattern]) => pattern.test(workflow))?.[1] ?? ActivityIcon
  return (
    <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-md border bg-muted/40 text-muted-foreground", className)}>
      <Icon className="size-4" aria-hidden />
    </span>
  )
}
