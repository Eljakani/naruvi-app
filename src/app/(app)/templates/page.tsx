import Link from "next/link"
import { Suspense } from "react"
import { connection } from "next/server"
import { PlusIcon } from "lucide-react"
import { PageHeader } from "@/components/page-header"
import { PdfThumb } from "@/components/templates/pdf-thumb"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { PRESETS } from "@/lib/design"
import { getDocumentDefaults } from "@/server/settings/service"
import { listTemplates, previewSource } from "@/server/templates/service"

export const metadata = { title: "Templates" }

export default function TemplatesPage() {
  return (
    <>
      <PageHeader
        title="Templates"
        description="How your CVs and letters look. Open a design to change it visually or describe what you want; the one marked Default is used for new documents."
        actions={
          <Button nativeButton={false} render={<Link href="/templates/new?from=classic" />}>
            <PlusIcon /> New template
          </Button>
        }
      />
      <Suspense fallback={<Grid>{Array.from({ length: 8 }, (_, i) => <Skeleton key={i} className="aspect-[210/297] rounded-xl" />)}</Grid>}>
        <Gallery />
      </Suspense>
    </>
  )
}

function Grid({ children }: { children: React.ReactNode }) {
  return <div className="cb-stagger grid min-w-0 grid-cols-2 gap-3 sm:gap-5 md:grid-cols-3 xl:grid-cols-4">{children}</div>
}

function Tile({ href, name, hint, tokens, badge, revision }: { href: string; name: string; hint: string; tokens: (typeof PRESETS)[string]["tokens"]; badge?: string; revision: string }) {
  return (
    <div className="group relative grid min-w-0 content-start gap-2 rounded-xl focus-within:ring-2 focus-within:ring-ring">
      <PdfThumb tokens={tokens} revision={revision} retryable className={badge === "Default" ? "ring-2 ring-foreground" : undefined} />
      <Link href={href} className="flex min-w-0 flex-wrap items-start justify-between gap-x-2 gap-y-1 px-0.5 after:absolute after:inset-0 after:rounded-xl focus-visible:outline-none">
        <div className="min-w-0">
          <div className="truncate text-sm font-medium">{name}</div>
          <div className="text-xs break-words text-muted-foreground">{hint}</div>
        </div>
        {badge ? <Badge variant="secondary">{badge}</Badge> : null}
      </Link>
    </div>
  )
}

async function Gallery() {
  await connection()
  const [saved, defaults, { revision }] = await Promise.all([listTemplates(), getDocumentDefaults(), previewSource()])
  const customDefault = !defaults.templateRef && defaults.design
  const isDefault = (id: string, saved: boolean) => (saved ? defaults.templateRef === id : !defaults.templateRef && !defaults.design && defaults.template === id)
  return (
    <div className="grid gap-8">
      {saved.length || customDefault ? (
        <section className="grid gap-3">
          <h2 className="text-sm font-semibold">Your templates</h2>
          <Grid>
            {customDefault ? <Tile href="/templates/new?default=1" name="Custom default" hint="Used for new CVs and letters" tokens={customDefault} badge="Default" revision={revision} /> : null}
            {saved.map((template) => (
              <Tile key={template.id} href={`/templates/${template.id}`} name={template.name} hint={`Based on ${PRESETS[template.basedOn]?.name ?? "Classic"}`} tokens={template.tokens} badge={isDefault(template.id, true) ? "Default" : "Yours"} revision={revision} />
            ))}
          </Grid>
        </section>
      ) : null}
      <section className="grid gap-3">
        <h2 className="text-sm font-semibold">Start from a design</h2>
        <Grid>
          {Object.entries(PRESETS).map(([id, preset]) => (
            <Tile key={id} href={`/templates/new?from=${id}`} name={preset.name} hint={preset.hint} tokens={isDefault(id, false) ? { ...preset.tokens, accent: defaults.accent } : preset.tokens} badge={isDefault(id, false) ? "Default" : undefined} revision={revision} />
          ))}
        </Grid>
      </section>
    </div>
  )
}
