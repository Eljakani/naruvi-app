/**
 * Thin indeterminate bar pinned to the top of its (relative) container while
 * work is in flight. Fades in after a short delay so instant actions never flash it.
 */
export function WorkingBar({ active }: { active: boolean }) {
  return (
    <div aria-hidden data-active={active} className="cb-working-bar pointer-events-none absolute inset-x-0 top-0 z-20 h-0.5 overflow-hidden">
      <div className="h-full w-1/3 rounded-full bg-primary/70" />
    </div>
  )
}
