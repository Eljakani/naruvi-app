"use client"

import { useRouter } from "next/navigation"
import { useState, useTransition, type ReactElement } from "react"
import { Building2Icon, GlobeIcon, Loader2Icon, PlusIcon } from "lucide-react"
import { toast } from "sonner"
import { addCompanyAction, setCompanyWebsiteAction } from "@/app/[locale]/(app)/companies/actions"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group"
import { guessCompany, normalizeWebsite } from "@/lib/company-input"
import { useTranslations } from "next-intl"

const NO_FILL = { autoComplete: "off", "data-1p-ignore": true, "data-lpignore": "true", "data-form-type": "other" } as const
const guessDomain = (name: string) => `${name.toLowerCase().replace(/[^a-z0-9]+/g, "")}.com`

/** Asks for a company's website when something needs it (the email finder, research). */
export function WebsiteDialog({ open, onOpenChange, companyName, reason, onSubmit }: { open: boolean; onOpenChange: (open: boolean) => void; companyName: string; reason: string; onSubmit: (website: string) => Promise<boolean> }) {
  const [value, setValue] = useState("")
  const [pending, startTransition] = useTransition()
  const valid = Boolean(normalizeWebsite(value))
  const t = useTranslations("companyDialogs")
  return (
    <Dialog open={open} onOpenChange={(next) => !pending && onOpenChange(next)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("website.title", { name: companyName })}</DialogTitle>
          <DialogDescription>{reason} {t("website.once")}</DialogDescription>
        </DialogHeader>
        <form
          id="website-form"
          autoComplete="off"
          onSubmit={(event) => {
            event.preventDefault()
            if (!valid) return
            startTransition(async () => {
              if (await onSubmit(value)) {
                setValue("")
                onOpenChange(false)
              }
            })
          }}
        >
          <Field>
            <FieldLabel htmlFor="company-website">{t("website.label")}</FieldLabel>
            <InputGroup>
              <InputGroupAddon><GlobeIcon /></InputGroupAddon>
              <InputGroupInput id="company-website" autoFocus value={value} onChange={(event) => setValue(event.target.value)} placeholder={guessDomain(companyName)} {...NO_FILL} />
            </InputGroup>
            <FieldDescription>{t("website.hint", { example: guessDomain(companyName) })}</FieldDescription>
          </Field>
        </form>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={pending}>{t("cancel")}</Button>
          <Button type="submit" form="website-form" disabled={!valid || pending}>
            {pending ? <Loader2Icon className="animate-spin" /> : null} {t("website.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** "Add website" on a company page that doesn't have one yet. */
export function AddWebsiteButton({ companyId, companyName }: { companyId: string; companyName: string }) {
  const [open, setOpen] = useState(false)
  const router = useRouter()
  const t = useTranslations("companyDialogs")
  return (
    <>
      <Button size="xs" variant="outline" onClick={() => setOpen(true)}><GlobeIcon /> {t("website.add")}</Button>
      <WebsiteDialog
        open={open}
        onOpenChange={setOpen}
        companyName={companyName}
        reason={t("website.reason")}
        onSubmit={async (website) => {
          const result = await setCompanyWebsiteAction(companyId, website)
          if (!result.ok) {
            toast.error(result.message)
            return false
          }
          toast.success(t("website.saved"))
          router.refresh()
          return true
        }}
      />
    </>
  )
}

/** Add a company on its own: from its name, its website or its LinkedIn company link. */
export function AddCompanyDialog({ trigger }: { trigger?: ReactElement }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [source, setSource] = useState("")
  const [name, setName] = useState("")
  const [website, setWebsite] = useState("")
  const [pending, startTransition] = useTransition()
  const t = useTranslations("companyDialogs")
  const fill = (value: string) => {
    const guess = guessCompany(value)
    setName((current) => current || guess.name)
    setWebsite((current) => current || guess.website)
  }
  const reset = () => { setSource(""); setName(""); setWebsite("") }
  return (
    <Dialog open={open} onOpenChange={(next) => { setOpen(next); if (!next) reset() }}>
      <DialogTrigger render={trigger ?? <Button variant="outline" />}>
        {trigger ? null : <><PlusIcon /> {t("add.button")}</>}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("add.title")}</DialogTitle>
          <DialogDescription>{t("add.description")}</DialogDescription>
        </DialogHeader>
        <form
          id="company-form"
          autoComplete="off"
          onSubmit={(event) => {
            event.preventDefault()
            startTransition(async () => {
              const result = await addCompanyAction({ name, website: website || undefined })
              if (!result.ok) return void toast.error(result.message)
              toast.success(t("add.added", { name }))
              setOpen(false)
              reset()
              router.push(`/companies/${result.data.id}`)
            })
          }}
        >
          <FieldGroup className="gap-4">
            <Field>
              <FieldLabel htmlFor="company-source">{t("add.source")}</FieldLabel>
              <InputGroup>
                <InputGroupAddon><Building2Icon /></InputGroupAddon>
                <InputGroupInput id="company-source" autoFocus value={source} onChange={(event) => setSource(event.target.value)} onBlur={(event) => fill(event.target.value)} onPaste={(event) => fill(event.clipboardData.getData("text"))} placeholder={t("add.sourcePlaceholder")} {...NO_FILL} />
              </InputGroup>
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="company-name">{t("add.name")}</FieldLabel>
                <Input id="company-name" required value={name} onChange={(event) => setName(event.target.value)} placeholder="Dashlane" {...NO_FILL} />
              </Field>
              <Field>
                <FieldLabel htmlFor="company-site">{t("website.label")} <span className="font-normal text-muted-foreground">{t("optional")}</span></FieldLabel>
                <Input id="company-site" value={website} onChange={(event) => setWebsite(event.target.value)} placeholder="dashlane.com" {...NO_FILL} />
              </Field>
            </div>
            <FieldDescription>{t("add.hint")}</FieldDescription>
          </FieldGroup>
        </form>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={pending}>{t("cancel")}</Button>
          <Button type="submit" form="company-form" disabled={!name.trim() || pending}>
            {pending ? <Loader2Icon className="animate-spin" /> : null} {t("add.button")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
