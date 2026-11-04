import { EntryEditor } from "@/components/profile/editor/entry-editor"

export const metadata = { title: "New entry" }

export default function NewEntryPage() {
  return <EntryEditor entry={null} />
}
