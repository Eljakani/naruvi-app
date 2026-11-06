"use client"

import { useState, useTransition } from "react"
import { Loader2Icon } from "lucide-react"
import { toast } from "sonner"
import { saveReplySettingAction } from "@/app/(app)/integrations/actions"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"

type Mode = "off" | "plus" | "domain"

/** Give each application its own reply address so replies are matched with certainty. */
export function ReplyAddresses({ email, initial }: { email: string; initial: { mode: Mode; domain?: string } }) {
  const [mode, setMode] = useState<Mode>(initial.mode)
  const [domain, setDomain] = useState(initial.domain ?? "")
  const [pending, startTransition] = useTransition()
  const [local, host] = email.split("@")
  const example = mode === "plus" ? `${local}+nrv-1a2b3c4d5e@${host}` : mode === "domain" ? `nrv-1a2b3c4d5e@${domain || "jobs.your-domain.com"}` : null
  const dirty = mode !== initial.mode || (mode === "domain" && domain !== (initial.domain ?? ""))
  return (
    <div className="grid gap-2 rounded-lg border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-medium text-foreground">Reply address per application</p>
          <p className="text-xs">Emails you send from Naruvi ask for replies at an address that names the application, so every reply is linked for sure. It still arrives in your inbox.</p>
        </div>
        <ToggleGroup aria-label="Reply addresses" variant="outline" size="sm" value={[mode]} onValueChange={(value) => value[0] && setMode(value[0] as Mode)}>
          <ToggleGroupItem value="off">Off</ToggleGroupItem>
          <ToggleGroupItem value="plus">+ address</ToggleGroupItem>
          <ToggleGroupItem value="domain">My domain</ToggleGroupItem>
        </ToggleGroup>
      </div>
      {mode === "plus" ? <p className="text-xs">Works with Gmail, Outlook, Fastmail, Proton and most providers that accept “you+anything@”. Nothing to set up.</p> : null}
      {mode === "domain" ? (
        <div className="grid gap-2 text-xs">
          <Input value={domain} onChange={(event) => setDomain(event.target.value)} placeholder="jobs.your-domain.com" aria-label="Domain" className="max-w-sm" />
          <p>
            Forward every address of that domain to {email}. With Cloudflare: Email → Email Routing → Routing rules → Catch-all → Send to {email}. Any provider with a catch-all forward works the same.
          </p>
        </div>
      ) : null}
      {example ? <p className="text-xs">Example: <code className="rounded bg-muted px-1">{example}</code></p> : null}
      {dirty ? (
        <Button
          size="sm"
          className="w-fit"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const result = await saveReplySettingAction({ mode, domain: mode === "domain" ? domain : undefined })
              if (!result.ok) toast.error(result.message)
              else toast.success(mode === "off" ? "Reply addresses off" : "Reply addresses on", { description: mode === "off" ? undefined : "New emails sent from Naruvi use them." })
            })
          }
        >
          {pending ? <Loader2Icon className="animate-spin" /> : null} Save
        </Button>
      ) : null}
    </div>
  )
}
