import { Suspense } from "react"
import { connection } from "next/server"
import { ReviewQueue } from "@/components/profile/review-queue"
import { Skeleton } from "@/components/ui/skeleton"
import { getReviewQueue } from "@/server/profile/repository"

export const metadata = { title: "Review profile" }

export default function ReviewPage() {
  return (
    <Suspense fallback={<Skeleton className="mx-auto h-96 w-full max-w-3xl rounded-xl" />}>
      <QueueLoader />
    </Suspense>
  )
}

async function QueueLoader() {
  await connection()
  return <ReviewQueue items={await getReviewQueue()} />
}
