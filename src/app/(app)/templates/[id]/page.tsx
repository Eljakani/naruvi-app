import { notFound } from "next/navigation"
import { Suspense } from "react"
import { connection } from "next/server"
import { TemplateEditor } from "@/components/templates/template-editor"
import { Skeleton } from "@/components/ui/skeleton"
import { ALL_PRESETS, DEFAULT_PRESET } from "@/lib/design"
import { getTemplate } from "@/server/templates/service"
import { getDocumentDefaults } from "@/server/settings/service"
import { z } from "zod"

export const metadata = { title: "Edit template" }

export default function TemplatePage({ params, searchParams }: PageProps<"/templates/[id]">) {
  return (
    <Suspense fallback={<Skeleton className="h-[80vh] rounded-xl" />}>
      <Loader params={params} searchParams={searchParams} />
    </Suspense>
  )
}

async function Loader({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await connection()
  const { id } = await params
  if (id === "new") {
    const query = await searchParams
    const from = query.from
    const preset = typeof from === "string" && Object.hasOwn(ALL_PRESETS, from) ? from : DEFAULT_PRESET
    const defaults = await getDocumentDefaults()
    if (query.default === "1" && !defaults.templateRef && defaults.design) {
      return <TemplateEditor key="new:default" initial={{ name: "My default design", basedOn: "classic", tokens: defaults.design, customDefault: true }} />
    }
    const tokens = !defaults.templateRef && !defaults.design && defaults.template === preset ? { ...ALL_PRESETS[preset].tokens, accent: defaults.accent } : ALL_PRESETS[preset].tokens
    return <TemplateEditor key={`new:${preset}`} initial={{ name: `My ${ALL_PRESETS[preset].name}`, basedOn: preset, tokens }} />
  }
  if (!z.string().uuid().safeParse(id).success) notFound()
  const template = await getTemplate(id)
  if (!template) notFound()
  return <TemplateEditor key={template.id} initial={template} />
}
