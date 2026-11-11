import { Suspense } from "react"
import { EntryEditor } from "@/components/profile/editor/entry-editor"
import { entryKinds } from "@/server/profile/schemas"
import { titled } from "@/i18n/metadata"

export const generateMetadata = titled("newEntry")

export default function NewEntryPage({ searchParams }: PageProps<"/[locale]/profile/new">) {
  return (
    <Suspense fallback={null}>
      <WithKind searchParams={searchParams} />
    </Suspense>
  )
}

/** `?kind=education` opens the editor on that kind. */
async function WithKind({ searchParams }: { searchParams: PageProps<"/[locale]/profile/new">["searchParams"] }) {
  const kind = (await searchParams).kind
  const initialKind = typeof kind === "string" && (entryKinds as readonly string[]).includes(kind) ? (kind as (typeof entryKinds)[number]) : undefined
  return <EntryEditor key={initialKind ?? "default"} entry={null} initialKind={initialKind} />
}
