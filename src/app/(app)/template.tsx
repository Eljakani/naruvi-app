import { PageTransition } from "@/components/page-transition"

/** Page hand-off between routes (see PageTransition). */
export default function AppTemplate({ children }: { children: React.ReactNode }) {
  return <PageTransition>{children}</PageTransition>
}
