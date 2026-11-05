import { Suspense } from "react"
import { connection } from "next/server"
import { ProfileWorkspace } from "@/components/profile/profile-workspace"
import { PageHeader } from "@/components/page-header"
import { Skeleton } from "@/components/ui/skeleton"
import { getProfile, listEntries } from "@/server/profile/repository"

export const metadata = { title: "Profile" }

export default function ProfilePage() {
  return (
    <>
      <PageHeader title="Profile" description="Verified facts are the only material Naruvi may use. Every bullet must point back to one." />
      <Suspense fallback={<ProfileSkeleton />}>
        <ProfileData />
      </Suspense>
    </>
  )
}

async function ProfileData() {
  await connection()
  const [profile, entries] = await Promise.all([getProfile(), listEntries()])
  return <ProfileWorkspace profile={profile} entries={entries} />
}

function ProfileSkeleton() {
  return (
    <div className="grid gap-4">
      <div className="grid gap-4 lg:grid-cols-3">
        <Skeleton className="h-40 rounded-xl lg:col-span-2" />
        <Skeleton className="h-40 rounded-xl" />
      </div>
      <Skeleton className="h-10 w-full rounded-lg" />
      {[0, 1, 2, 3].map((i) => (
        <Skeleton key={i} className="h-24 rounded-xl" />
      ))}
    </div>
  )
}
