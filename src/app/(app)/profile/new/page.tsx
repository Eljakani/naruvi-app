import { EntryEditor } from "@/components/profile/editor/entry-editor"
import { entryKinds } from "@/server/profile/schemas"

export const metadata = { title: "New entry" }

export default async function NewEntryPage({ searchParams }: PageProps<"/profile/new">) {
  const kind = (await searchParams).kind
  const initialKind = typeof kind === "string" && (entryKinds as readonly string[]).includes(kind) ? (kind as (typeof entryKinds)[number]) : undefined
  return <EntryEditor entry={null} initialKind={initialKind} />
}
