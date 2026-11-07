import Image from "next/image"

/** Decorative brand artwork; the surrounding home link supplies its accessible name. */
export function NaruviMark({ className }: { className?: string }) {
  return (
    <Image src="/brand/naruvi-otter-128-v2.png" width={128} height={128} alt="" aria-hidden="true" className={className} unoptimized />
  )
}
