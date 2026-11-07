"use client"

import { useActionState } from "react"
import Link from "next/link"
import { ArrowLeftIcon, CheckIcon, PaletteIcon } from "lucide-react"
import { ApplicationNav } from "@/components/applications/application-nav"
import { LanguageMenu, RegenerateButton } from "@/components/documents/document-shell"
import { PdfThumb } from "@/components/templates/pdf-thumb"
import { Button } from "@/components/ui/button"
import type { DesignTokens } from "@/lib/design"

/**
 * First visit to a CV or letter: same frame as the editor, what will happen,
 * one button, and a preview of the look so the page isn't a lone button.
 */
export function DocumentStart({
  applicationId,
  jobTitle,
  company,
  kind,
  language,
  steps,
  action,
  label,
  icon,
  title,
  lead,
  note,
  design,
  designName,
}: {
  applicationId: string
  jobTitle: string
  company: string
  kind: "cv" | "letter"
  language: string
  steps: readonly string[]
  action: (formData: FormData) => Promise<void | string>
  label: string
  icon: React.ReactNode
  title: string
  lead: string
  note?: string
  design: DesignTokens
  designName: string
}) {
  const [error, submit] = useActionState(async (_previous: string, data: FormData) => (await action(data)) ?? "", "")
  const base = `/applications/${applicationId}`
  return (
    <div className="-mx-4 -mt-4 flex h-[calc(100svh-3.5rem)] flex-col md:-mx-6 md:-mt-6">
      <div className="flex flex-wrap items-center gap-3 border-b bg-background px-4 py-2.5 md:px-6">
        <Button variant="ghost" size="icon-sm" aria-label="Back to the application" nativeButton={false} render={<Link href={base} />}>
          <ArrowLeftIcon />
        </Button>
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold">{jobTitle}</div>
          <div className="truncate text-xs text-muted-foreground">{company}</div>
        </div>
        <div className="ml-2">
          <ApplicationNav applicationId={applicationId} current={kind} language={language} />
        </div>
        <LanguageMenu current={language} hrefFor={(code) => `${base}/${kind}?lang=${code}`} />
      </div>

      <div className="grid min-h-0 flex-1 lg:grid-cols-[440px_minmax(0,1fr)]">
        <div className="flex min-h-0 flex-col overflow-y-auto border-r bg-background p-6 md:p-8">
          <div className="cb-enter my-auto grid gap-6">
            <div className="grid gap-2">
              <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
              <p className="text-sm text-muted-foreground">{lead}</p>
              {note ? <p className="text-sm">{note}</p> : null}
            </div>
            <ol className="cb-stagger grid gap-2.5">
              {steps.map((step, index) => (
                <li key={step} className="flex items-start gap-3 text-sm">
                  <span className="mt-px flex size-5 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-medium tabular-nums">{index + 1}</span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
            <form action={submit} className="grid gap-2">
              <input type="hidden" name="applicationId" value={applicationId} />
              <input type="hidden" name="language" value={language} />
              {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
              <RegenerateButton label={label} steps={steps} variant="default" size="default" icon={icon} />
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <CheckIcon className="size-3.5" /> {kind === "letter" ? "You can edit and approve the draft before using it." : "Uses only your verified facts. You can edit everything afterwards."}
              </p>
            </form>
          </div>
        </div>
        <div className="hidden min-h-0 flex-col items-center justify-center gap-3 bg-muted/40 p-8 lg:flex">
          <div className="relative w-full max-w-md">
            {kind === "cv" ? <PdfThumb tokens={design} className="shadow-lg" /> : <LetterSketch design={design} />}
            <div className="pointer-events-none absolute inset-0 rounded-md bg-gradient-to-t from-background/80 via-transparent to-transparent" />
          </div>
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <PaletteIcon className="size-3.5" /> It will look like this ({designName}). Content is tailored to this job.
            <Link href="/templates" className="underline underline-offset-2 hover:text-foreground">Change</Link>
          </p>
        </div>
      </div>
    </div>
  )
}

/** A letter-shaped sketch in the chosen design's colours (the real letter appears after drafting). */
function LetterSketch({ design }: { design: DesignTokens }) {
  const line = (width: string, key: number) => <span key={key} className="h-1.5 rounded-full bg-muted" style={{ width }} />
  return (
    <div className="grid aspect-[210/297] content-start gap-6 rounded-md bg-white p-[9%] shadow-lg ring-1 ring-border">
      <div className="grid gap-2">
        <span className="h-3 w-2/5 rounded-full" style={{ backgroundColor: design.accentName ? design.accent : design.ink }} />
        <span className="h-1.5 w-3/5 rounded-full bg-muted" />
      </div>
      <span className="h-px w-full" style={{ backgroundColor: design.accent, opacity: 0.5 }} />
      <div className="grid gap-2">{["30%", "22%"].map(line)}</div>
      <span className="h-2 w-1/2 rounded-full" style={{ backgroundColor: design.accentHeadings ? design.accent : design.ink, opacity: 0.8 }} />
      {[0, 1, 2].map((block) => (
        <div key={block} className="grid gap-2">{["100%", "96%", "100%", "70%"].map((width, index) => line(width, index))}</div>
      ))}
      <div className="grid gap-2">{["25%", "35%"].map(line)}</div>
    </div>
  )
}
