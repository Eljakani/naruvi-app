import { Suspense } from "react"
import { connection } from "next/server"
import { ContactsView } from "@/components/contacts/contacts-view"
import { SearchBox } from "@/components/list-toolbar"
import { PageHeader } from "@/components/page-header"
import { Skeleton } from "@/components/ui/skeleton"
import { emailFinderStatus, listContacts } from "@/server/contacts/repository"
import { useTranslations } from "next-intl"
import { getTranslations } from "next-intl/server"

export async function generateMetadata() {
  return { title: (await getTranslations("nav.items"))("contacts.title") }
}

export default function ContactsPage({ searchParams }: PageProps<"/[locale]/contacts">) {
  const t = useTranslations("contacts")
  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />
      <Suspense fallback={<Skeleton className="h-80 rounded-xl" />}>
        <Contacts searchParams={searchParams} />
      </Suspense>
    </>
  )
}

async function Contacts({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await connection()
  const q = (await searchParams).q
  const t = await getTranslations("contacts")
  const [rows, finder] = await Promise.all([listContacts(typeof q === "string" ? q.slice(0, 200) : undefined), emailFinderStatus()])
  return (
    <ContactsView contacts={rows} finder={finder.configured} search={<SearchBox placeholder={t("search")} />} />
  )
}
