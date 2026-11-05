import { Suspense } from "react"
import { connection } from "next/server"
import { ProfileWorkspace } from "@/components/profile/profile-workspace"
import { PageHeader } from "@/components/page-header"
import { Skeleton } from "@/components/ui/skeleton"
import { getProfile, listEntries } from "@/server/profile/repository"

export const metadata = { title: "Profile" }

export default function ProfilePage() {
  return (
    <div className="mx-auto grid w-full max-w-5xl gap-6">
      <PageHeader title="Profile" description="Everything your CVs and letters say about you comes from here, and nothing else." />
      <Suspense fallback={<ProfileSkeleton />}>
        <ProfileData />
      </Suspense>
    </div>
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
      <Skeleton className="h-32 rounded-xl" />
      <Skeleton className="h-9 w-full rounded-lg" />
      {[0, 1, 2, 3].map((i) => (
        <Skeleton key={i} className="h-14 rounded-xl" />
      ))}
    </div>
  )
}
