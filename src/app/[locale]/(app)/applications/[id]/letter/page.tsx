import { CompanyLogoProvider } from "@/components/documents/document-shell"
import { notFound } from "next/navigation"
import { startDesign } from "@/server/templates/service"
import { listTemplates } from "@/server/templates/service"
import { Suspense } from "react"
import { connection } from "next/server"
import { LetterWorkspace } from "@/components/applications/letter-workspace"
import { Skeleton } from "@/components/ui/skeleton"
import { getApplication } from "@/server/applications/repository"
import { getLetterWorkspace } from "@/server/documents/service"
import type { CompanyResearch as Research } from "@/server/research/brief"
import { titled } from "@/i18n/metadata"

export const generateMetadata = titled("letter")

export default function LetterPage({ params, searchParams }: PageProps<"/[locale]/applications/[id]/letter">) {
  return (
    <Suspense fallback={<Skeleton className="h-[80vh] rounded-xl" />}>
      <Loader params={params} searchParams={searchParams} />
    </Suspense>
  )
}

async function Loader({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await connection()
  const { id } = await params
  const query = await searchParams
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound()
  const application = await getApplication(id)
  if (!application) notFound()
  const language = typeof query.lang === "string" && /^[a-z]{2}$/.test(query.lang) ? query.lang : application.language
  const [workspace, templates] = await Promise.all([getLetterWorkspace(id, language), listTemplates()])
  return (
    <CompanyLogoProvider logo={application.job.company?.logoPath ?? null}>
    <LetterWorkspace
      key={workspace?.current?.id ?? "empty"}
      applicationId={id}
      jobTitle={application.job.title}
      company={application.job.company?.name ?? ""}
      language={language}
      decision={application.analysis?.coverLetter ?? null}
      jobId={application.job.id}
      research={(application.job.company?.research ?? null) as unknown as Research | null}
      workspace={workspace}
      startDesign={await startDesign()}
      savedTemplates={templates.map(({ id, name, tokens }) => ({ id, name, tokens }))}
    />
    </CompanyLogoProvider>
  )
}
