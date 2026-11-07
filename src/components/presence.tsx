"use client"

import { AnimatePresence, motion, MotionConfig, type HTMLMotionProps } from "motion/react"
import type { ReactNode } from "react"

/**
 * Smooth in and out, instead of things popping. Exits are the part CSS can't
 * do: the element stays long enough to fade and fold its height away, so the
 * content below glides up instead of jumping.
 */
const EASE_OUT = [0.23, 1, 0.32, 1] as const
const FOLD = {
  initial: { opacity: 0, height: 0, y: -2 },
  animate: { opacity: 1, height: "auto", y: 0 },
  exit: { opacity: 0, height: 0, y: -2 },
  transition: { duration: 0.2, ease: EASE_OUT },
} as const

// Clip while folding, but leave room for focus rings and shadows.
const CLIP = { overflow: "clip", overflowClipMargin: 6 } as const

/** Shows or hides one block (a message, a section, a hint). */
export function Presence({ show, children, className, initial = false }: { show: boolean; children: ReactNode; className?: string; initial?: boolean }) {
  return (
    <MotionConfig reducedMotion="user">
      <AnimatePresence initial={initial}>
        {show ? (
          <motion.div key="presence" {...FOLD} style={CLIP} className={className}>
            {children}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </MotionConfig>
  )
}

/** A list whose items fold in when added and fold out when removed. Give each item a stable key. */
export function PresenceList({ children }: { children: ReactNode }) {
  return (
    <MotionConfig reducedMotion="user">
      <AnimatePresence initial={false}>{children}</AnimatePresence>
    </MotionConfig>
  )
}

/** One item of a PresenceList. Renders a div by default; `as="li"` inside lists. */
export function PresenceItem({ as = "div", children, className, ...props }: { as?: "div" | "li"; children: ReactNode; className?: string } & Omit<HTMLMotionProps<"div">, "children">) {
  const Component = as === "li" ? motion.li : motion.div
  return (
    <Component layout="position" {...FOLD} style={CLIP} className={className} {...(props as object)}>
      {children}
    </Component>
  )
}
