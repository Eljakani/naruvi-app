import { notFound } from "next/navigation"
import { Suspense } from "react"
import { connection } from "next/server"
import { TemplateEditor } from "@/components/templates/template-editor"
import { Skeleton } from "@/components/ui/skeleton"
import { PRESETS } from "@/lib/design"
import { getTemplate } from "@/server/templates/service"

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
    const from = (await searchParams).from
    const preset = typeof from === "string" && PRESETS[from] ? from : "classic"
    return <TemplateEditor initial={{ name: `My ${PRESETS[preset].name}`, basedOn: preset, tokens: PRESETS[preset].tokens }} />
  }
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound()
  const template = await getTemplate(id)
  if (!template) notFound()
  return <TemplateEditor initial={template} />
}
