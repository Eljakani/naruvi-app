"use client"

import { useDirection } from "@base-ui/react/direction-provider"
import { LayoutGroup, motion } from "motion/react"
import { useId } from "react"
import { cn } from "@/lib/utils"

export type SegmentedOption<T extends string> = {
  value: T
  label: React.ReactNode
  /** Classes for the sliding thumb when this option is chosen (for a colour per state). */
  thumbClassName?: string
  /** Classes for the label when this option is chosen. */
  activeClassName?: string
  title?: string
}

/**
 * One choice out of a few, as a pill whose highlight slides to the chosen
 * option. Arrow keys move between options.
 */
export function Segmented<T extends string>({ value, onChange, options, label, size = "sm", className }: { value: T; onChange: (value: T) => void; options: SegmentedOption<T>[]; label: string; size?: "xs" | "sm"; className?: string }) {
  const id = useId()
  const inlineDirection = useDirection() === "rtl" ? -1 : 1
  const move = (step: number) => {
    const index = options.findIndex((option) => option.value === value)
    const next = options[(index + step + options.length) % options.length]
    onChange(next.value)
    requestAnimationFrame(() => document.getElementById(`${id}-${next.value}`)?.focus())
  }
  return (
    <LayoutGroup id={id}>
      <div
        role="radiogroup"
        aria-label={label}
        className={cn("inline-flex items-center rounded-lg bg-muted p-0.5", className)}
        onKeyDown={(event) => {
          const step = { ArrowRight: inlineDirection, ArrowLeft: -inlineDirection, ArrowDown: 1, ArrowUp: -1 }[event.key]
          if (!step) return
          event.preventDefault()
          move(step)
        }}
      >
        {options.map((option) => {
          const active = option.value === value
          return (
            <button
              key={option.value}
              id={`${id}-${option.value}`}
              type="button"
              role="radio"
              aria-checked={active}
              tabIndex={active ? 0 : -1}
              title={option.title}
              onClick={() => onChange(option.value)}
              className={cn(
                "relative inline-flex items-center gap-1.5 rounded-md font-medium whitespace-nowrap transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                size === "xs" ? "h-6 px-2 text-[11px]" : "h-7 px-2.5 text-xs",
                active ? cn("text-foreground", option.activeClassName) : "text-muted-foreground hover:text-foreground",
              )}
            >
              {active ? <motion.span layoutId="thumb" className={cn("absolute inset-0 rounded-md bg-background shadow-xs", option.thumbClassName)} transition={{ type: "spring", duration: 0.35, bounce: 0.15 }} /> : null}
              <span className="relative inline-flex items-center gap-1.5 [&_svg]:size-3.5">{option.label}</span>
            </button>
          )
        })}
      </div>
    </LayoutGroup>
  )
}
