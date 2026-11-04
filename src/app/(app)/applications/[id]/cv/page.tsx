import { notFound } from "next/navigation"
import { Suspense } from "react"
import { connection } from "next/server"
import { CvWorkspace } from "@/components/applications/cv-workspace"
import { Skeleton } from "@/components/ui/skeleton"
import { getApplication } from "@/server/applications/repository"
import { getCvWorkspace } from "@/server/documents/service"

export const metadata = { title: "CV" }

export default function CvPage({ params, searchParams }: PageProps<"/applications/[id]/cv">) {
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
  const workspace = await getCvWorkspace(id, language)
  return (
    <CvWorkspace
      key={workspace?.current?.id ?? "empty"}
      applicationId={id}
      jobTitle={application.job.title}
      company={application.job.company?.name ?? ""}
      language={language}
      workspace={workspace}
    />
  )
}
