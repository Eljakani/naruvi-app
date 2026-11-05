"use client"

import { useRef, useState, useTransition } from "react"
import { ImageUpIcon, Loader2Icon, PlusIcon, TrashIcon, UserRoundIcon } from "lucide-react"
import { toast } from "sonner"
import { saveIdentityAction, uploadPhotoAction } from "@/app/(app)/profile/actions"
import { Button } from "@/components/ui/button"
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import type { profiles } from "@/server/db/schema"

type Profile = typeof profiles.$inferSelect

export function IdentityDialog({ open, onOpenChange, profile }: { open: boolean; onOpenChange: (open: boolean) => void; profile: Profile | null }) {
  const [form, setForm] = useState(() => ({
    fullName: profile?.fullName ?? "",
    headlines: { en: profile?.headlines?.en ?? "", fr: profile?.headlines?.fr ?? "" },
    summaries: { en: profile?.summaries?.en ?? "", fr: profile?.summaries?.fr ?? "" },
    photoPath: profile?.photoPath ?? null,
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
      const headlines = Object.fromEntries(Object.entries(form.headlines).filter(([, value]) => value.trim()))
      const summaries = Object.fromEntries(Object.entries(form.summaries).filter(([, value]) => value.trim()))
      const result = await saveIdentityAction({ ...form, headlines, summaries })
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
          <div className="flex items-center gap-4">
            <PhotoField value={form.photoPath} name={form.fullName} onChange={(photoPath) => setForm({ ...form, photoPath })} />
            <div className="grid flex-1 gap-2">
              <Field id="fullName" label="Full name" value={form.fullName} onChange={set("fullName")} />
            </div>
          </div>
          <div className="grid gap-2">
            <Label>Headline</Label>
            <div className="grid gap-2">
              {(["en", "fr"] as const).map((lang) => (
                <div key={lang} className="flex items-center gap-2">
                  <span className="w-7 shrink-0 rounded border px-1 text-center font-mono text-[10px] uppercase text-muted-foreground">{lang}</span>
                  <Input
                    aria-label={`Headline ${lang}`}
                    value={form.headlines[lang]}
                    onChange={(event) => setForm({ ...form, headlines: { ...form.headlines, [lang]: event.target.value } })}
                    placeholder={lang === "en" ? "e.g. Registered Nurse · Pediatrics" : "ex. Infirmière diplômée · Pédiatrie"}
                  />
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">The line under your name. A job can override it later; it never invents seniority.</p>
          </div>
          <div className="grid gap-2">
            <Label>About you</Label>
            <div className="grid gap-2">
              {(["en", "fr"] as const).map((lang) => (
                <div key={lang} className="flex items-start gap-2">
                  <span className="mt-2 w-7 shrink-0 rounded border px-1 text-center font-mono text-[10px] uppercase text-muted-foreground">{lang}</span>
                  <Textarea
                    aria-label={`Summary ${lang}`}
                    value={form.summaries[lang]}
                    onChange={(event) => setForm({ ...form, summaries: { ...form.summaries, [lang]: event.target.value } })}
                    placeholder={lang === "en" ? "2–3 sentences: what you do, for whom, and what you’re known for." : "2–3 phrases : ce que vous faites, pour qui, et ce qui vous distingue."}
                    className="min-h-16"
                    maxLength={1200}
                  />
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">Shown as a short paragraph at the top of your CV. For each job, AI can tailor it using only your verified facts.</p>
          </div>
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

function PhotoField({ value, name, onChange }: { value: string | null; name: string; onChange: (path: string | null) => void }) {
  const input = useRef<HTMLInputElement>(null)
  const [pending, startTransition] = useTransition()
  const upload = (file: File | undefined) => {
    if (!file) return
    const form = new FormData()
    form.set("file", file)
    startTransition(async () => {
      const result = await uploadPhotoAction(form)
      if (!result.ok) return void toast.error("Photo not added", { description: result.error })
      onChange(result.data!.path)
      if (result.data!.warning) toast.warning(result.data!.warning)
    })
  }
  return (
    <div className="grid justify-items-center gap-1.5">
      <button
        type="button"
        onClick={() => input.current?.click()}
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault()
          upload(event.dataTransfer.files[0])
        }}
        className="group relative size-20 overflow-hidden rounded-full border bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        aria-label={value ? "Replace photo" : "Add photo"}
      >
        {value ? (
          // eslint-disable-next-line @next/next/no-img-element -- local asset
          <img src={`/api/assets/${value}`} alt={`${name} photo`} className="size-full object-cover" />
        ) : (
          <UserRoundIcon className="mx-auto size-8 text-muted-foreground" />
        )}
        <span className="absolute inset-0 flex items-center justify-center bg-black/45 text-white opacity-0 transition-opacity group-hover:opacity-100">
          {pending ? <Loader2Icon className="size-5 animate-spin" /> : <ImageUpIcon className="size-5" />}
        </span>
      </button>
      {value ? (
        <button type="button" className="text-xs text-muted-foreground hover:text-foreground" onClick={() => onChange(null)}>
          Remove
        </button>
      ) : (
        <span className="text-xs text-muted-foreground">Optional</span>
      )}
      <input
        ref={input}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={(event) => {
          upload(event.target.files?.[0])
          event.target.value = ""
        }}
      />
    </div>
  )
}
