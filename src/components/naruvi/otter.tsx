import Image from "next/image"
import { cn } from "@/lib/utils"

/**
 * Naruvi, the otter. One character with a pose per situation, so the same
 * companion shows up when there's something to find, check, plan, celebrate
 * or get through. Images: public/mascot/web (see scripts/mascot-web.mjs).
 */
export type OtterPose = "concept" | "finding-opportunity" | "reviewing-cv" | "planning-next-step" | "interview-practice" | "offering-reassurance" | "celebrating-progress" | "working-on-it" | "good-news-mail" | "thinking" | "tailoring-cv" | "writing-letter" | "reading-stack" | "careful" | "all-checked"

const SIZE: Record<OtterPose, [number, number]> = {
  concept: [292, 360],
  "finding-opportunity": [322, 360],
  "reviewing-cv": [282, 360],
  "planning-next-step": [281, 360],
  "interview-practice": [306, 360],
  "offering-reassurance": [276, 360],
  "celebrating-progress": [255, 360],
  "working-on-it": [248, 360],
  "good-news-mail": [298, 360],
  thinking: [270, 360],
  "tailoring-cv": [273, 360],
  "writing-letter": [278, 360],
  "reading-stack": [288, 360],
  careful: [238, 360],
  "all-checked": [287, 360],
}

/** A full-body pose, sized by height. Decorative: the text next to it carries the meaning. */
export function Otter({ pose, height = 120, className, priority = false }: { pose: OtterPose; height?: number; className?: string; priority?: boolean }) {
  const [w, h] = SIZE[pose]
  return (
    <Image
      src={`/mascot/web/${pose}.webp`}
      width={Math.round((w / h) * height)}
      height={height}
      alt=""
      aria-hidden="true"
      draggable={false}
      priority={priority}
      unoptimized
      className={cn("pointer-events-none shrink-0 select-none", className)}
    />
  )
}

/** Naruvi's face in a copper ring: who is talking, in the assistant and in its notes. */
export function NaruviAvatar({ size = 32, className }: { size?: number; className?: string }) {
  return (
    <span className={cn("inline-grid shrink-0 place-content-center overflow-hidden rounded-full bg-brand-soft ring-1 ring-brand/25", className)} style={{ width: size, height: size }}>
      <Image src="/brand/naruvi-otter-64-v2.png" width={64} height={64} alt="" aria-hidden="true" unoptimized draggable={false} style={{ width: size, height: size }} />
    </span>
  )
}

/** An empty state with Naruvi in it: a pose, one line of what's going on, and what to do. */
export function OtterEmpty({ pose, title, children, action, className }: { pose: OtterPose; title: React.ReactNode; children?: React.ReactNode; action?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col items-center gap-3 rounded-xl border border-dashed px-6 py-10 text-center", className)}>
      <div className="relative">
        <span className="absolute inset-x-2 bottom-1 h-6 rounded-[50%] bg-brand/10 blur-md" aria-hidden />
        <Otter pose={pose} height={128} className="relative" />
      </div>
      <div className="grid max-w-md gap-1">
        <p className="font-medium text-balance">{title}</p>
        {children ? <div className="text-sm text-pretty text-muted-foreground">{children}</div> : null}
      </div>
      {action ? <div className="flex flex-wrap justify-center gap-2">{action}</div> : null}
    </div>
  )
}
