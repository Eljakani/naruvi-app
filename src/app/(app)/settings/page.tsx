import { ComingNext } from "@/components/coming-next"

export const metadata = { title: "Settings" }

export default function Page() {
  return <ComingNext url="/settings" step="step 5" bullets={["Model provider (any OpenAI-compatible endpoint)", "LaTeX compiler service status", "Export and backup of your data"]} />
}
