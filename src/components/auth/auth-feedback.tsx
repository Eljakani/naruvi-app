"use client"

import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import type { ReactNode } from "react"

/** Change feedback only when its meaning changes, never on every keystroke. */
export function AuthFeedback({ state, children }: { state: string; children: ReactNode }) {
  const reduce = useReducedMotion()
  return <AnimatePresence initial={false} mode="wait">
    <motion.div key={state} initial={{ opacity: 0, y: reduce ? 0 : 3 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: reduce ? 0 : -2 }} transition={{ duration: .15, ease: [0.23, 1, 0.32, 1] }}>{children}</motion.div>
  </AnimatePresence>
}
