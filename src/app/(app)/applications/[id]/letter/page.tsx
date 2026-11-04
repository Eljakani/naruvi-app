import { notFound } from "next/navigation"
import { Suspense } from "react"
import { connection } from "next/server"
import { LetterWorkspace } from "@/components/applications/letter-workspace"
import { Skeleton } from "@/components/ui/skeleton"
import { getApplication } from "@/server/applications/repository"
import { getLetterWorkspace } from "@/server/documents/service"

export const metadata = { title: "Cover letter" }

export default function LetterPage({ params, searchParams }: PageProps<"/applications/[id]/letter">) {
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
  const workspace = await getLetterWorkspace(id, language)
  return (
    <LetterWorkspace
      key={workspace?.current?.id ?? "empty"}
      applicationId={id}
      jobTitle={application.job.title}
      company={application.job.company?.name ?? ""}
      language={language}
      decision={application.analysis?.coverLetter ?? null}
      workspace={workspace}
    />
  )
}
