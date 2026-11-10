"use client"

import { useRef, useState, useTransition } from "react"
import { AlertTriangleIcon, ImageUpIcon, LinkIcon, Loader2Icon, XIcon } from "lucide-react"
import { toast } from "sonner"
import { logoFromUrlAction, uploadLogoAction } from "@/app/[locale]/(app)/profile/actions"
import { EntryLogo } from "@/components/profile/entry-logo"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"
import { useTranslations } from "next-intl"

type Stored = { path: string; width: number | null; height: number | null; warning: string | null }

export function LogoField({ value, name, onChange }: { value: string | null; name: string; onChange: (path: string | null) => void }) {
  const t = useTranslations("logoField")
  const input = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const [warning, setWarning] = useState<string | null>(null)
  const [url, setUrl] = useState("")
  const [urlOpen, setUrlOpen] = useState(false)
  const [pending, startTransition] = useTransition()

  const accept = (result: { ok: true; data?: Stored } | { ok: false; error: string }) => {
    if (!result.ok) return void toast.error(t("failed"), { description: result.error })
    onChange(result.data!.path)
    setWarning(result.data!.warning)
    toast.success(t("added"), { description: result.data!.width ? t("addedSize", { width: result.data!.width, height: result.data!.height ?? 0 }) : t("clickSave") })
  }
  const upload = (file: File | undefined) => {
    if (!file) return
    const form = new FormData()
    form.set("file", file)
    startTransition(async () => accept(await uploadLogoAction(form)))
  }
  const fromUrl = () =>
    startTransition(async () => {
      const result = await logoFromUrlAction(url)
      accept(result)
      if (result.ok) {
        setUrl("")
        setUrlOpen(false)
      }
    })

  return (
    <div className="grid gap-2">
      <div
        onDragOver={(event) => {
          event.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault()
          setDragging(false)
          upload(event.dataTransfer.files[0])
        }}
        className={cn("flex items-center gap-4 rounded-lg border border-dashed p-3 transition-colors", dragging && "border-primary bg-primary/5")}
      >
        <div className="relative">
          <EntryLogo path={value} name={name || "Logo"} size={64} />
          {pending ? (
            <span className="absolute inset-0 flex items-center justify-center rounded-lg bg-background/70">
              <Loader2Icon className="size-5 animate-spin" />
            </span>
          ) : null}
        </div>
        <div className="grid flex-1 gap-2">
          <p className="text-sm text-muted-foreground">{value ? t("shown") : t("drop")}</p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => input.current?.click()} disabled={pending}>
              <ImageUpIcon /> {value ? t("replace") : t("upload")}
            </Button>
            <Popover open={urlOpen} onOpenChange={setUrlOpen}>
              <PopoverTrigger render={<Button size="sm" variant="outline" disabled={pending} />}>
                <LinkIcon /> {t("fromUrl")}
              </PopoverTrigger>
              <PopoverContent className="w-96" align="start">
                <form
                  className="grid gap-2"
                  onSubmit={(event) => {
                    event.preventDefault()
                    fromUrl()
                  }}
                >
                  <Input autoFocus value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://example.com/logo.png" aria-label={t("imageUrl")} />
                  <p className="text-xs text-muted-foreground">{t("directLink")}</p>
                  <Button type="submit" size="sm" disabled={pending || !url.trim()}>
                    {t("add")}
                  </Button>
                </form>
              </PopoverContent>
            </Popover>
            {value ? (
              <Button
                size="sm"
                variant="ghost"
                className="text-muted-foreground"
                onClick={() => {
                  onChange(null)
                  setWarning(null)
                }}
              >
                <XIcon /> {t("remove")}
              </Button>
            ) : null}
          </div>
        </div>
        <input
          ref={input}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
          className="hidden"
          onChange={(event) => {
            upload(event.target.files?.[0])
            event.target.value = ""
          }}
        />
      </div>
      {warning ? (
        <p className="flex items-start gap-1.5 text-xs text-amber-600">
          <AlertTriangleIcon className="mt-0.5 size-3.5 shrink-0" /> {warning}
        </p>
      ) : null}
    </div>
  )
}
