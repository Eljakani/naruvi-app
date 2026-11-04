"use client"

import { useState, useTransition } from "react"
import { PlusIcon, TrashIcon } from "lucide-react"
import { toast } from "sonner"
import { saveIdentityAction } from "@/app/(app)/profile/actions"
import { Button } from "@/components/ui/button"
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { profiles } from "@/server/db/schema"

type Profile = typeof profiles.$inferSelect

export function IdentityDialog({ open, onOpenChange, profile }: { open: boolean; onOpenChange: (open: boolean) => void; profile: Profile | null }) {
  const [form, setForm] = useState(() => ({
    fullName: profile?.fullName ?? "",
    headline: profile?.headline ?? "",
    email: profile?.email ?? "",
    phone: profile?.phone ?? "",
    location: profile?.location ?? "",
    availability: profile?.availability ?? "",
    links: profile?.links ?? [],
  }))
  const [pending, startTransition] = useTransition()
  const set = (key: keyof typeof form) => (event: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [key]: event.target.value })
  const save = () =>
    startTransition(async () => {
      const result = await saveIdentityAction(form)
      if (!result.ok) return void toast.error("Could not save", { description: result.error })
      toast.success("Identity saved")
      onOpenChange(false)
    })
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Identity & contact</DialogTitle>
          <DialogDescription>Copied verbatim into every document. Generation is never allowed to change these.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <Field id="fullName" label="Full name" value={form.fullName} onChange={set("fullName")} />
          <Field id="headline" label="Headline" value={form.headline} onChange={set("headline")} placeholder="DevSecOps & Cloud Security Engineer" />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="email" label="Email" value={form.email} onChange={set("email")} type="email" />
            <Field id="phone" label="Phone" value={form.phone} onChange={set("phone")} />
            <Field id="location" label="Location" value={form.location} onChange={set("location")} />
            <Field id="availability" label="Availability" value={form.availability} onChange={set("availability")} />
          </div>
          <div className="grid gap-2">
            <Label>Links</Label>
            {form.links.map((link, index) => (
              <div key={index} className="flex gap-2">
                <Input aria-label="Label" className="w-32" value={link.label} onChange={(event) => setForm({ ...form, links: form.links.map((item, i) => (i === index ? { ...item, label: event.target.value } : item)) })} />
                <Input aria-label="URL" value={link.url} onChange={(event) => setForm({ ...form, links: form.links.map((item, i) => (i === index ? { ...item, url: event.target.value } : item)) })} />
                <Button size="icon" variant="ghost" aria-label="Remove link" onClick={() => setForm({ ...form, links: form.links.filter((_, i) => i !== index) })}>
                  <TrashIcon />
                </Button>
              </div>
            ))}
            <Button size="sm" variant="outline" className="w-fit" onClick={() => setForm({ ...form, links: [...form.links, { label: "", url: "https://" }] })}>
              <PlusIcon /> Add link
            </Button>
          </div>
        </div>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
          <Button onClick={save} disabled={pending}>
            {pending ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function Field({ id, label, ...props }: { id: string; label: string } & React.ComponentProps<typeof Input>) {
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} {...props} />
    </div>
  )
}
