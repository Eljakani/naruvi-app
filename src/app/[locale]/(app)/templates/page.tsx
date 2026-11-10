import Link from "next/link"
import { Suspense } from "react"
import { connection } from "next/server"
import { PlusIcon } from "lucide-react"
import { PageHeader } from "@/components/page-header"
import { PdfThumb } from "@/components/templates/pdf-thumb"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import { ALL_PRESETS, PRESETS } from "@/lib/design"
import { getDocumentDefaults } from "@/server/settings/service"
import { listTemplates, previewSource } from "@/server/templates/service"
import { titled } from "@/i18n/metadata"
import { useTranslations } from "next-intl"
import { getTranslations } from "next-intl/server"

export const generateMetadata = titled("templates")

export default function TemplatesPage() {
  const t = useTranslations("templates")
  return (
    <>
      <PageHeader
        title={t("title")}
        description={t("description")}
        actions={
          <Button nativeButton={false} render={<Link href="/templates/new?from=classic" />}>
            <PlusIcon /> {t("new")}
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
      {/* The pair: CV with its matching cover letter tucked behind. */}
      <div className="relative pr-[18%] pb-[6%]">
        <PdfThumb tokens={tokens} kind="letter" revision={revision} className="absolute right-0 bottom-0 w-[62%] rotate-3 opacity-90 shadow-sm transition-transform duration-200 ease-(--ease-out) group-hover:rotate-6" />
        <PdfThumb tokens={tokens} revision={revision} retryable className={cn("relative shadow-sm", badge === "Default" && "ring-2 ring-foreground")} />
      </div>
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
  const t = await getTranslations("templates")
  await connection()
  const [saved, defaults, { revision }] = await Promise.all([listTemplates(), getDocumentDefaults(), previewSource()])
  const customDefault = !defaults.templateRef && defaults.design
  const isDefault = (id: string, saved: boolean) => (saved ? defaults.templateRef === id : !defaults.templateRef && !defaults.design && defaults.template === id)
  return (
    <div className="grid gap-8">
      {saved.length || customDefault ? (
        <section className="grid gap-3">
          <h2 className="text-sm font-semibold">{t("yours")}</h2>
          <Grid>
            {customDefault ? <Tile href="/templates/new?default=1" name={t("customDefault")} hint={t("customDefaultHint")} tokens={customDefault} badge={t("default")} revision={revision} /> : null}
            {saved.map((template) => (
              <Tile key={template.id} href={`/templates/${template.id}`} name={template.name} hint={t("basedOn", { name: ALL_PRESETS[template.basedOn]?.name ?? "Classic" })} tokens={template.tokens} badge={isDefault(template.id, true) ? t("default") : t("yoursBadge")} revision={revision} />
            ))}
          </Grid>
        </section>
      ) : null}
      <section className="grid gap-3">
        <h2 className="text-sm font-semibold">{t("start")}</h2>
        <Grid>
          {Object.entries(PRESETS).map(([id, preset]) => (
            <Tile key={id} href={`/templates/new?from=${id}`} name={preset.name} hint={t.has(`presets.${id}` as never) ? t(`presets.${id}` as never) : preset.hint} tokens={isDefault(id, false) ? { ...preset.tokens, accent: defaults.accent } : preset.tokens} badge={isDefault(id, false) ? t("default") : undefined} revision={revision} />
          ))}
        </Grid>
      </section>
    </div>
  )
}
