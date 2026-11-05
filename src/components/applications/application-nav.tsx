import Link from "next/link"
import { FileTextIcon, MailIcon, ScanSearchIcon } from "lucide-react"
import { cn } from "@/lib/utils"

/** Analysis · CV · Cover letter, shared by the application page and both document workspaces. */
export function ApplicationNav({ applicationId, current, language }: { applicationId: string; current: "analysis" | "cv" | "letter"; language: string }) {
  const base = `/applications/${applicationId}`
  const items = [
    { id: "analysis", label: "Analysis", href: base, icon: ScanSearchIcon },
    { id: "cv", label: "CV", href: `${base}/cv?lang=${language}`, icon: FileTextIcon },
    { id: "letter", label: "Cover letter", href: `${base}/letter?lang=${language}`, icon: MailIcon },
  ] as const
  return (
    <nav className="flex w-fit rounded-lg bg-muted p-0.5" aria-label="Application">
      {items.map((item) => (
        <Link
          key={item.id}
          href={item.href}
          aria-current={current === item.id ? "page" : undefined}
          className={cn("flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-medium transition-colors", current === item.id ? "bg-background text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground")}
        >
          <item.icon className="size-3.5" /> {item.label}
        </Link>
      ))}
    </nav>
  )
}
