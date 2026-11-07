import Link from "next/link"
import { OtterEmpty } from "@/components/naruvi/otter"
import { Button } from "@/components/ui/button"

export default function NotFound() {
  return (
    <OtterEmpty
      pose="finding-opportunity"
      title="I looked everywhere, but this page isn’t here"
      className="mt-10"
      action={
        <>
          <Button nativeButton={false} render={<Link href="/" />}>Back to the dashboard</Button>
          <Button variant="outline" nativeButton={false} render={<Link href="/applications" />}>Open Applications</Button>
        </>
      }
    >
      It may have been archived or deleted, or the link is from an older version of Naruvi.
    </OtterEmpty>
  )
}
