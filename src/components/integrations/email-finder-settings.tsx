"use client"

import { useState, useTransition } from "react"
import { CheckCircle2Icon, Loader2Icon, MailSearchIcon } from "lucide-react"
import { toast } from "sonner"
import { saveEmailFinderAction } from "@/app/(app)/contacts/actions"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"

/** Find a contact's professional email from their name and company (Hunter.io, your own key). */
export function EmailFinderSettings({ configured }: { configured: boolean }) {
  const [key, setKey] = useState("")
  const [pending, startTransition] = useTransition()
  const save = (value: string) =>
    startTransition(async () => {
      const result = await saveEmailFinderAction(value)
      if (!result.ok) return void toast.error(result.message)
      setKey("")
      toast(value ? "Email finder ready" : "Email finder removed")
    })
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MailSearchIcon className="size-4" /> Email finder
        </CardTitle>
        <CardDescription>Find a recruiter’s or manager’s work email from their name and their company’s website, one contact at a time, with “Find email” on the Contacts page. Uses Hunter.io with your own key (free plan available).</CardDescription>
        {configured ? (
          <CardAction>
            <Badge variant="secondary" className="gap-1"><CheckCircle2Icon /> Ready</Badge>
          </CardAction>
        ) : null}
      </CardHeader>
      <CardContent className="grid gap-3 text-sm">
        <form
          className="flex gap-2"
          autoComplete="off"
          onSubmit={(event) => {
            event.preventDefault()
            save(key)
          }}
        >
          <Input type="password" value={key} onChange={(event) => setKey(event.target.value)} placeholder={configured ? "Paste a new key to replace it" : "Hunter.io API key"} aria-label="Hunter.io API key" autoComplete="new-password" data-1p-ignore data-lpignore="true" data-form-type="other" />
          <Button type="submit" disabled={pending || !key.trim()}>
            {pending ? <Loader2Icon className="animate-spin" /> : null} Save
          </Button>
          {configured ? <Button type="button" variant="ghost" disabled={pending} onClick={() => save("")}>Remove</Button> : null}
        </form>
        <p className="text-xs text-muted-foreground">Only the name and the company’s domain are sent, and only when you click Find email. Write to people about relevant roles and respect their privacy and local rules (such as GDPR).</p>
      </CardContent>
    </Card>
  )
}
