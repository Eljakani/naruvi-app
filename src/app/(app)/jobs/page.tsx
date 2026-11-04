import { ComingNext } from "@/components/coming-next"

export const metadata = { title: "Jobs" }

export default function Page() {
  return <ComingNext url="/jobs" step="step 3" bullets={["Paste any job link (any board or careers page) or the raw text", "Company website resolved and verified, never the job-board host", "Logo taken from the posting or the company site, shape-checked"]} />
}
