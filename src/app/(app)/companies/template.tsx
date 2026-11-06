import { PageTransition } from "@/components/page-transition"

export default function Template({ children }: { children: React.ReactNode }) {
  return <PageTransition nested>{children}</PageTransition>
}
