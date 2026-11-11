"use client"

import { PresenceItem, PresenceList } from "@/components/presence"
import Link from "next/link"
import { useState, useTransition } from "react"
import { Loader2Icon, PlusIcon, UserPlusIcon, UsersIcon, XIcon } from "lucide-react"
import { toast } from "sonner"
import { linkContactAction, unlinkContactAction } from "@/app/[locale]/(app)/contacts/actions"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useTranslations } from "next-intl"

type Person = { id: string; name: string; title: string; email: string; linkedinUrl: string; role: string }
type Option = { id: string; name: string; title: string; company: string | null }

/** The people this application is with: who you write to, who referred you. */
export function ApplicationPeople({ applicationId, people, options }: { applicationId: string; people: Person[]; options: Option[] }) {
  const t = useTranslations("contacts.people")
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
          <UserPlusIcon /> {t("addContact")}
        </PopoverTrigger>
        <PopoverContent align="start" className="w-80 gap-2 p-2">
          <div className="grid gap-0.5 px-1.5 pt-1">
            <p className="text-sm font-medium">{t("who")}</p>
            <p className="text-xs text-muted-foreground">{t("whoHint")}</p>
          </div>
          {choices.length ? (
            <>
              <Input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("search")} aria-label={t("search")} className="h-8 text-sm" />
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
                {!matches.length ? <li className="px-2 py-1.5 text-xs text-muted-foreground">{t("noMatch", { query })}</li> : null}
              </ul>
            </>
          ) : null}
          <Button size="sm" variant="ghost" className="justify-start" nativeButton={false} render={<Link href="/contacts" />}>
            <PlusIcon /> {t("new")}
          </Button>
        </PopoverContent>
      </Popover>
    )
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <UsersIcon className="size-4" /> {t("title")}
        </CardTitle>
        <CardDescription>{people.length ? t("firstWithAddress") : t("linkHint")}</CardDescription>
        <CardAction>
          <Button size="sm" variant="ghost" onClick={() => setAdding((value) => !value)} disabled={!choices.length && !adding}>
            <PlusIcon /> {t("add")}
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="grid gap-2 text-sm">
        <PresenceList>
        {people.map((person) => (
          <PresenceItem key={person.id} className="flex items-center gap-2">
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{person.name}</p>
              <p className="truncate text-xs text-muted-foreground">{[person.title, person.email || t("noEmail")].filter(Boolean).join(" · ")}</p>
            </div>
            <Button size="icon-xs" variant="ghost" aria-label={t("remove", { name: person.name })} disabled={pending} onClick={() => startTransition(async () => void (await unlinkContactAction(applicationId, person.id)))}>
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
              <SelectTrigger aria-label={t("choose")} className="w-full">
                {pending ? <Loader2Icon className="animate-spin" /> : null}
                <SelectValue placeholder={t("choose")} />
              </SelectTrigger>
              <SelectContent>
                {choices.map((choice) => (
                  <SelectItem key={choice.value} value={choice.value}>{choice.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <p className="text-xs text-muted-foreground">{t.rich("noOthers", { link: (chunks) => <Link href="/contacts" className="underline">{chunks}</Link> })}</p>
          )
        ) : null}
              </CardContent>
    </Card>
  )
}
