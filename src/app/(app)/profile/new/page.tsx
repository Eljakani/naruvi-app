import { Suspense } from "react"
import { EntryEditor } from "@/components/profile/editor/entry-editor"
import { entryKinds } from "@/server/profile/schemas"

export const metadata = { title: "New entry" }

export default function NewEntryPage({ searchParams }: PageProps<"/profile/new">) {
  return (
    <Suspense fallback={<EntryEditor entry={null} />}>
      <WithKind searchParams={searchParams} />
    </Suspense>
  )
}

/** `?kind=education` opens the editor on that kind. */
async function WithKind({ searchParams }: { searchParams: PageProps<"/profile/new">["searchParams"] }) {
  const kind = (await searchParams).kind
  const initialKind = typeof kind === "string" && (entryKinds as readonly string[]).includes(kind) ? (kind as (typeof entryKinds)[number]) : undefined
  return <EntryEditor key={initialKind ?? "default"} entry={null} initialKind={initialKind} />
}
