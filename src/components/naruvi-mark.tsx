import type { ComponentProps } from "react"

/** The Naruvi monogram, shared with the app icon. */
export function NaruviMark(props: ComponentProps<"svg">) {
  return (
    <svg viewBox="0 0 32 32" fill="none" aria-hidden="true" {...props}>
      <path d="M8 25V7L24 25V7" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
