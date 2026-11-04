import { ComingNext } from "@/components/coming-next"

export const metadata = { title: "Runs" }

export default function Page() {
  return <ComingNext url="/runs" step="step 7" bullets={["Every workflow run with its steps", "Model, prompt version, tokens, cost and latency per step", "Why a candidate was kept, discarded or rejected"]} />
}
