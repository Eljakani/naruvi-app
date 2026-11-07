"use client"

import { PresenceItem, PresenceList } from "@/components/presence"
import Link from "next/link"
import { useState, useTransition } from "react"
import { Loader2Icon, PlusIcon, UsersIcon, XIcon } from "lucide-react"
import { toast } from "sonner"
import { linkContactAction, unlinkContactAction } from "@/app/(app)/contacts/actions"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

type Person = { id: string; name: string; title: string; email: string; linkedinUrl: string; role: string }
type Option = { id: string; name: string; title: string; company: string | null }

/** The people this application is with: who you write to, who referred you. */
export function ApplicationPeople({ applicationId, people, options }: { applicationId: string; people: Person[]; options: Option[] }) {
  const [adding, setAdding] = useState(false)
  const [pending, startTransition] = useTransition()
  const linked = new Set(people.map((person) => person.id))
  const choices = options.filter((option) => !linked.has(option.id)).map((option) => ({ value: option.id, label: [option.name, option.title, option.company].filter(Boolean).join(" · ") }))
  // Nobody linked yet: one quiet line instead of a full card above the analysis.
  if (!people.length && !adding) {
    return (
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed px-3 py-2 text-sm text-muted-foreground">
        <UsersIcon className="size-4" />
        <span className="flex-1">No contact linked. Link the recruiter or manager you’re in touch with to write to them from here.</span>
        {choices.length ? (
          <Button size="xs" variant="outline" onClick={() => setAdding(true)}>
            <PlusIcon /> Link a contact
          </Button>
        ) : (
          <Button size="xs" variant="outline" nativeButton={false} render={<Link href="/contacts" />}>
            <PlusIcon /> Add a contact
          </Button>
        )}
      </div>
    )
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <UsersIcon className="size-4" /> People
        </CardTitle>
        <CardDescription>{people.length ? "Emails you write here go to the first person with an address." : "Link the recruiter or manager you’re in touch with."}</CardDescription>
        <CardAction>
          <Button size="sm" variant="ghost" onClick={() => setAdding((value) => !value)} disabled={!choices.length && !adding}>
            <PlusIcon /> Add
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="grid gap-2 text-sm">
        <PresenceList>
        {people.map((person) => (
          <PresenceItem key={person.id} className="flex items-center gap-2">
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{person.name}</p>
              <p className="truncate text-xs text-muted-foreground">{[person.title, person.email || "no email yet"].filter(Boolean).join(" · ")}</p>
            </div>
            <Button size="icon-xs" variant="ghost" aria-label={`Remove ${person.name}`} disabled={pending} onClick={() => startTransition(async () => void (await unlinkContactAction(applicationId, person.id)))}>
              <XIcon />
            </Button>
          </PresenceItem>
        ))}
        </PresenceList>
        {adding ? (
          choices.length ? (
            <Select
              items={choices}
              onValueChange={(value) =>
                value &&
                startTransition(async () => {
                  const result = await linkContactAction(applicationId, String(value), "recipient")
                  if (!result.ok) toast.error(result.message)
                  setAdding(false)
                })
              }
            >
              <SelectTrigger aria-label="Choose a contact" className="w-full">
                {pending ? <Loader2Icon className="animate-spin" /> : null}
                <SelectValue placeholder="Choose a contact" />
              </SelectTrigger>
              <SelectContent>
                {choices.map((choice) => (
                  <SelectItem key={choice.value} value={choice.value}>{choice.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <p className="text-xs text-muted-foreground">No other contacts. <Link href="/contacts" className="underline">Add one</Link>.</p>
          )
        ) : null}
        {!people.length && !adding ? <Link href="/contacts" className="text-xs text-muted-foreground underline underline-offset-2">Manage contacts</Link> : null}
      </CardContent>
    </Card>
  )
}
