import { ComingNext } from "@/components/coming-next"

export const metadata = { title: "Profile" }

export default function Page() {
  return <ComingNext url="/profile" step="step 2" bullets={["Facts with evidence, tags and do-not-claim rules", "Approved phrasings per language", "Import from an existing CV or LinkedIn export, reviewed before use"]} />
}
