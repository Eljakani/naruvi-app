"use client"

import { PresenceItem, PresenceList } from "@/components/presence"
import Link from "next/link"
import { useState, useTransition } from "react"
import { Loader2Icon, PlusIcon, UserPlusIcon, UsersIcon, XIcon } from "lucide-react"
import { toast } from "sonner"
import { linkContactAction, unlinkContactAction } from "@/app/(app)/contacts/actions"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

type Person = { id: string; name: string; title: string; email: string; linkedinUrl: string; role: string }
type Option = { id: string; name: string; title: string; company: string | null }

/** The people this application is with: who you write to, who referred you. */
export function ApplicationPeople({ applicationId, people, options }: { applicationId: string; people: Person[]; options: Option[] }) {
  const [adding, setAdding] = useState(false)
  const [query, setQuery] = useState("")
  const [pending, startTransition] = useTransition()
  const linked = new Set(people.map((person) => person.id))
  const choices = options.filter((option) => !linked.has(option.id)).map((option) => ({ value: option.id, label: [option.name, option.title, option.company].filter(Boolean).join(" · ") }))
  // Nobody linked yet: a small button among the actions, not a row of empty space.
  if (!people.length) {
    const matches = choices.filter((choice) => choice.label.toLowerCase().includes(query.trim().toLowerCase())).slice(0, 8)
    return (
      <Popover open={adding} onOpenChange={(open) => { setAdding(open); if (!open) setQuery("") }}>
        <PopoverTrigger render={<Button variant="outline" />}>
          <UserPlusIcon /> Add contact
        </PopoverTrigger>
        <PopoverContent align="start" className="w-80 gap-2 p-2">
          <div className="grid gap-0.5 px-1.5 pt-1">
            <p className="text-sm font-medium">Who are you in touch with?</p>
            <p className="text-xs text-muted-foreground">Emails you write here will go to them.</p>
          </div>
          {choices.length ? (
            <>
              <Input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search your contacts" aria-label="Search your contacts" className="h-8 text-sm" />
              <ul className="grid max-h-60 overflow-y-auto">
                {matches.map((choice) => (
                  <li key={choice.value}>
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() =>
                        startTransition(async () => {
                          const result = await linkContactAction(applicationId, choice.value, "recipient")
                          if (!result.ok) return void toast.error(result.message)
                          setAdding(false)
                        })
                      }
                      className="w-full truncate rounded-md px-2 py-1.5 text-start text-sm transition-colors hover:bg-muted disabled:opacity-50"
                    >
                      {choice.label}
                    </button>
                  </li>
                ))}
                {!matches.length ? <li className="px-2 py-1.5 text-xs text-muted-foreground">No contact matches “{query}”.</li> : null}
              </ul>
            </>
          ) : null}
          <Button size="sm" variant="ghost" className="justify-start" nativeButton={false} render={<Link href="/contacts" />}>
            <PlusIcon /> New contact
          </Button>
        </PopoverContent>
      </Popover>
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
              </CardContent>
    </Card>
  )
}
