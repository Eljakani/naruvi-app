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
import { listTemplates } from "@/server/templates/service"

export const metadata = { title: "Templates" }

export default function TemplatesPage() {
  return (
    <>
      <PageHeader
        title="Templates"
        description="How your CVs and letters look. Start from a design, change anything visually or just describe what you want, then use it on any document."
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
  return <div className="grid grid-cols-2 gap-5 md:grid-cols-3 xl:grid-cols-4">{children}</div>
}

function Tile({ href, name, hint, tokens, badge }: { href: string; name: string; hint: string; tokens: (typeof PRESETS)[string]["tokens"]; badge?: string }) {
  return (
    <Link href={href} className="group grid gap-2 rounded-xl focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
      <PdfThumb tokens={tokens} className="shadow-xs transition-shadow group-hover:shadow-md" />
      <div className="flex items-start justify-between gap-2 px-0.5">
        <div className="min-w-0">
          <div className="truncate text-sm font-medium">{name}</div>
          <div className="truncate text-xs text-muted-foreground">{hint}</div>
        </div>
        {badge ? <Badge variant="secondary">{badge}</Badge> : null}
      </div>
    </Link>
  )
}

async function Gallery() {
  await connection()
  const saved = await listTemplates()
  return (
    <div className="grid gap-8">
      {saved.length ? (
        <section className="grid gap-3">
          <h2 className="text-sm font-semibold">Your templates</h2>
          <Grid>
            {saved.map((template) => (
              <Tile key={template.id} href={`/templates/${template.id}`} name={template.name} hint={`Based on ${PRESETS[template.basedOn]?.name ?? "Classic"}`} tokens={template.tokens} badge="Yours" />
            ))}
          </Grid>
        </section>
      ) : null}
      <section className="grid gap-3">
        <h2 className="text-sm font-semibold">Start from a design</h2>
        <Grid>
          {Object.entries(PRESETS).map(([id, preset]) => (
            <Tile key={id} href={`/templates/new?from=${id}`} name={preset.name} hint={preset.hint} tokens={preset.tokens} />
          ))}
        </Grid>
      </section>
    </div>
  )
}
