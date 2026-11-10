import { ViewTransition } from "react"

/**
 * Page hand-off: when a route segment's template remounts, the old page fades
 * out fast and the new one fades in. Used by app/[locale]/(app)/template.tsx and by the
 * templates of segments with nested pages (jobs → jobs/[id]…), since a template
 * only remounts when its own child segment changes. Updates inside a page
 * (server actions, streaming) don't animate it.
 */
export function PageTransition({ children, nested = false }: { children: React.ReactNode; nested?: boolean }) {
  return (
    <ViewTransition enter="page-enter" exit="page-exit" default="none">
      <div className={nested ? "flex min-w-0 flex-1 flex-col gap-6" : "cb-page flex min-w-0 flex-1 flex-col gap-6"}>{children}</div>
    </ViewTransition>
  )
}
