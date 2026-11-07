"use client"

import { PresenceItem, PresenceList } from "@/components/presence"
import { useRef, useState, useTransition } from "react"
import { ImageUpIcon, Loader2Icon, PlusIcon, TrashIcon, UserRoundIcon } from "lucide-react"
import { toast } from "sonner"
import { saveIdentityAction, uploadPhotoAction } from "@/app/(app)/profile/actions"
import { Button } from "@/components/ui/button"
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { MAX_IMAGE_BYTES } from "@/lib/asset-limits"
import { LanguageSwitch, LANGUAGE_NAMES } from "@/components/profile/language-switch"
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
  const [uploading, startUpload] = useTransition()
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
  const [lang, setLang] = useState<"en" | "fr">("en")
  // Stable keys so removing a link folds that row away, not the last one.
  const [linkKeys, setLinkKeys] = useState(() => form.links.map(() => crypto.randomUUID()))
  const other = lang === "en" ? "fr" : "en"
  const setText = (key: "headlines" | "summaries", value: string) => setForm((current) => ({ ...current, [key]: { ...current[key], [lang]: value } }))
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[calc(100dvh-2rem)] flex-col sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Identity & contact</DialogTitle>
          <DialogDescription>Copied as-is into every CV and letter. AI never changes these.</DialogDescription>
        </DialogHeader>
        <div className="-mx-4 grid min-h-0 flex-1 content-start gap-6 overflow-y-auto overscroll-contain px-4 pb-1">
          <section className="grid gap-4" aria-labelledby="identity-who">
            <h3 id="identity-who" className="sr-only">Who you are</h3>
            <div className="flex items-center gap-4">
              <PhotoField pending={uploading || pending} startUpload={startUpload} value={form.photoPath} name={form.fullName} onChange={(photoPath) => setForm((current) => ({ ...current, photoPath }))} />
              <div className="grid flex-1 gap-2">
                <Field id="fullName" label="Full name" value={form.fullName} onChange={set("fullName")} autoComplete="name" />
              </div>
            </div>
          </section>

          <section className="grid gap-3 rounded-lg border p-3" aria-labelledby="identity-intro">
            <div className="flex flex-wrap items-center gap-2">
              <h3 id="identity-intro" className="flex-1 text-sm font-medium">How you introduce yourself</h3>
              <LanguageSwitch value={lang} onChange={setLang} languages={["en", "fr"] as const} filled={(code) => Boolean(form.headlines[code].trim())} />
            </div>
            <div key={lang} className="cb-fade grid gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="headline">Headline</Label>
                <Input id="headline" value={form.headlines[lang]} onChange={(event) => setText("headlines", event.target.value)} placeholder={lang === "en" ? "e.g. Registered Nurse · Pediatrics" : "ex. Infirmière diplômée · Pédiatrie"} />
                <p className="text-xs text-muted-foreground">The line under your name. A job can adjust it; it never invents seniority.</p>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="summary">About you <span className="font-normal text-muted-foreground">(optional)</span></Label>
                <Textarea id="summary" value={form.summaries[lang]} onChange={(event) => setText("summaries", event.target.value)} placeholder={lang === "en" ? "2–3 sentences: what you do, for whom, and what you’re known for." : "2–3 phrases : ce que vous faites, pour qui, et ce qui vous distingue."} className="min-h-20" maxLength={1200} />
                <p className="text-xs text-muted-foreground">A short paragraph at the top of your CV. AI can tailor it per job using only your verified facts.</p>
              </div>
              {!form.headlines[lang].trim() && !form.summaries[lang].trim() && (form.headlines[other].trim() || form.summaries[other].trim()) ? (
                <Button size="sm" variant="outline" className="w-fit" onClick={() => setForm((current) => ({ ...current, headlines: { ...current.headlines, [lang]: current.headlines[other] }, summaries: { ...current.summaries, [lang]: current.summaries[other] } }))}>
                  Start from the {LANGUAGE_NAMES[other]} text
                </Button>
              ) : null}
            </div>
          </section>

          <section className="grid gap-3" aria-labelledby="identity-contact">
            <h3 id="identity-contact" className="text-sm font-medium">Contact</h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field id="email" label="Email" value={form.email} onChange={set("email")} type="email" autoComplete="email" />
              <Field id="phone" label="Phone" value={form.phone} onChange={set("phone")} type="tel" autoComplete="tel" />
              <Field id="location" label="Location" value={form.location} onChange={set("location")} placeholder="City, country" />
              <Field id="availability" label="Availability" value={form.availability} onChange={set("availability")} placeholder="e.g. Immediately, March 2027" />
            </div>
          </section>

          <section className="grid gap-2" aria-labelledby="identity-links">
            <h3 id="identity-links" className="text-sm font-medium">Links</h3>
            <PresenceList>
            {form.links.map((link, index) => (
              <PresenceItem key={linkKeys[index] ?? index} className="flex gap-2">
                <Input aria-label="Label" className="w-32" value={link.label} placeholder="LinkedIn" onChange={(event) => setForm({ ...form, links: form.links.map((item, i) => (i === index ? { ...item, label: event.target.value } : item)) })} />
                <Input aria-label="URL" type="url" value={link.url} onChange={(event) => setForm({ ...form, links: form.links.map((item, i) => (i === index ? { ...item, url: event.target.value } : item)) })} />
                <Button size="icon" variant="ghost" aria-label="Remove link" onClick={() => { setForm({ ...form, links: form.links.filter((_, i) => i !== index) }); setLinkKeys((keys) => keys.filter((_, i) => i !== index)) }}>
                  <TrashIcon />
                </Button>
              </PresenceItem>
            ))}
            </PresenceList>
            <Button size="sm" variant="outline" className="w-fit" onClick={() => { setForm({ ...form, links: [...form.links, { label: "", url: "https://" }] }); setLinkKeys((keys) => [...keys, crypto.randomUUID()]) }}>
              <PlusIcon /> Add link
            </Button>
          </section>
        </div>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
          <Button onClick={save} disabled={pending || uploading}>
            {pending ? <Loader2Icon className="animate-spin" /> : null} {pending ? "Saving…" : "Save"}
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

async function preparePhoto(file: File): Promise<Blob> {
  if (file.size <= MAX_IMAGE_BYTES) return file
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
    throw new Error("Choose a JPEG, PNG or WebP photo.")
  }

  const bitmap = await createImageBitmap(file)
  try {
    const scale = Math.min(1, 1200 / Math.max(bitmap.width, bitmap.height))
    const canvas = document.createElement("canvas")
    canvas.width = Math.max(1, Math.round(bitmap.width * scale))
    canvas.height = Math.max(1, Math.round(bitmap.height * scale))
    const context = canvas.getContext("2d")
    if (!context) throw new Error("Couldn’t resize this photo. Choose a photo under 2 MB.")
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    const photo = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", 0.85))
    if (!photo || photo.size > MAX_IMAGE_BYTES) throw new Error("Choose a photo under 2 MB.")
    return photo
  } finally {
    bitmap.close()
  }
}

function PhotoField({ value, name, onChange, pending, startUpload }: { value: string | null; name: string; onChange: (path: string | null) => void; pending: boolean; startUpload: React.TransitionStartFunction }) {
  const input = useRef<HTMLInputElement>(null)
  const upload = (file: File | undefined) => {
    if (!file || pending) return
    startUpload(async () => {
      try {
        const photo = await preparePhoto(file)
        const form = new FormData()
        form.set("file", photo, photo === file ? file.name : "profile-photo")
        const result = await uploadPhotoAction(form)
        if (!result.ok) return void toast.error("Photo not added", { description: result.error })
        onChange(result.data!.path)
        if (result.data!.warning) toast.warning(result.data!.warning)
      } catch {
        toast.error("Photo not added", { description: "Try a JPEG, PNG or WebP photo under 2 MB." })
      }
    })
  }
  return (
    <div className="grid justify-items-center gap-1.5">
      <button
        type="button"
        disabled={pending}
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
        <span className={`absolute inset-0 flex items-center justify-center bg-black/45 text-white transition-opacity group-hover:opacity-100 ${pending ? "opacity-100" : "opacity-0"}`}>
          {pending ? <Loader2Icon className="size-5 animate-spin" /> : <ImageUpIcon className="size-5" />}
        </span>
      </button>
      {value ? (
        <button type="button" disabled={pending} className="text-xs text-muted-foreground hover:text-foreground" onClick={() => onChange(null)}>
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
