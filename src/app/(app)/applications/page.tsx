import { ComingNext } from "@/components/coming-next"

export const metadata = { title: "Applications" }

export default function Page() {
  return <ComingNext url="/applications" step="step 5" bullets={["Per-application CV and cover letter per language", "Immutable revisions with diff and one-click undo", "Quality gate score, hard errors and guarded fixes"]} />
}
