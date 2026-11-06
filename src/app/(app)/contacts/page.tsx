import { Suspense } from "react"
import { connection } from "next/server"
import { ContactsView } from "@/components/contacts/contacts-view"
import { SearchBox } from "@/components/list-toolbar"
import { PageHeader } from "@/components/page-header"
import { Skeleton } from "@/components/ui/skeleton"
import { emailFinderStatus, listContacts } from "@/server/contacts/repository"

export const metadata = { title: "Contacts" }

export default function ContactsPage({ searchParams }: PageProps<"/contacts">) {
  return (
    <>
      <PageHeader title="Contacts" description="Recruiters, HR, hiring managers and people who can refer you. Write to them about a job, or send a spontaneous application." />
      <Suspense fallback={<Skeleton className="h-80 rounded-xl" />}>
        <Contacts searchParams={searchParams} />
      </Suspense>
    </>
  )
}

async function Contacts({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await connection()
  const q = (await searchParams).q
  const [rows, finder] = await Promise.all([listContacts(typeof q === "string" ? q.slice(0, 200) : undefined), emailFinderStatus()])
  return (
    <div className="grid gap-3">
      <SearchBox placeholder="Search name, role, company, email…" />
      <ContactsView contacts={rows} finder={finder.configured} />
    </div>
  )
}
