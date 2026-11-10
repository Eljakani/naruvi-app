import { Suspense } from "react"
import { notFound } from "next/navigation"
import { connection } from "next/server"
import { EntryEditor } from "@/components/profile/editor/entry-editor"
import { Skeleton } from "@/components/ui/skeleton"
import { getEntry } from "@/server/profile/repository"
import { titled } from "@/i18n/metadata"

export const generateMetadata = titled("editEntry")

export default function EntryPage({ params }: PageProps<"/[locale]/profile/[id]">) {
  return (
    <Suspense fallback={<EditorSkeleton />}>
      <EntryLoader params={params} />
    </Suspense>
  )
}

async function EntryLoader({ params }: { params: Promise<{ id: string }> }) {
  await connection()
  const { id } = await params
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound()
  const entry = await getEntry(id)
  if (!entry) notFound()
  return <EntryEditor key={`${entry.id}-${entry.updatedAt.getTime()}`} entry={entry} />
}

function EditorSkeleton() {
  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className="grid gap-6">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-48 rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-80 rounded-xl" />
    </div>
  )
}
