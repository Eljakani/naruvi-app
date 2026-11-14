"use client"

import Link from "next/link"
import { useState, type ReactNode } from "react"
import { CheckIcon, ChevronLeftIcon, ChevronRightIcon } from "lucide-react"
import { motion, MotionConfig } from "motion/react"
import { useTranslations } from "next-intl"
import { Badge } from "@/components/reui/badge"
import { Frame, FrameDescription, FrameFooter, FrameHeader, FramePanel, FrameTitle } from "@/components/reui/frame"
import { IconTile } from "@/components/reui/icon-tile"
import { Stepper, StepperContent, StepperDescription, StepperIndicator, StepperItem, StepperNav, StepperPanel, StepperSeparator, StepperTitle, StepperTrigger } from "@/components/reui/stepper"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

/** Quick, decelerating, and never bouncy: the guide should feel settled, not lively. */
const EASE = [0.22, 1, 0.36, 1] as const

export type SetupStep = { key: string; title: string; short: string; why: string; done: boolean; note?: string; content: ReactNode; /** The content brings its own card, so it sits in the frame without a second border. */ bare?: boolean }

/**
 * The guide's steps, one in view at a time. Any step can be opened in any
 * order; panels stay mounted so a half-typed key survives a look at another step.
 */
export function SetupSteps({ steps, initial }: { steps: SetupStep[]; initial: number }) {
  const t = useTranslations("setup")
  const [active, setActive] = useState(initial)
  return (
    <MotionConfig reducedMotion="user">
      <Stepper value={active} onValueChange={setActive} className="grid gap-3">
        <StepperNav className="gap-1">
          {steps.map((step, index) => {
            const number = index + 1
            return (
              <StepperItem key={step.key} step={number} className="items-center">
                <StepperTrigger className="min-w-0 rounded-lg p-1.5 text-start transition-colors duration-200 hover:bg-muted/60">
                  <StepperIndicator
                    className={cn(
                      "size-7 transition-[background-color,color,box-shadow] duration-300",
                      // ReUI marks every earlier step as completed; here only finished work earns the filled mark.
                      step.done ? "bg-primary! text-primary-foreground!" : active === number ? "bg-foreground! text-background!" : "bg-accent! text-accent-foreground!",
                      active === number && "ring-4 ring-foreground/8",
                    )}
                  >
                    {step.done ? (
                      <motion.span key="done" initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: 0.3, ease: EASE }} className="flex">
                        <CheckIcon className="size-4" aria-hidden />
                      </motion.span>
                    ) : <span className="tabular-nums">{number}</span>}
                  </StepperIndicator>
                  <span className="grid min-w-0 gap-1">
                    <StepperTitle className={cn("truncate transition-colors duration-200", active !== number && "text-muted-foreground")}>{step.title}</StepperTitle>
                    <StepperDescription className="hidden truncate text-xs leading-none md:block">{step.done ? t("done") : step.short}</StepperDescription>
                  </span>
                </StepperTrigger>
                {number < steps.length ? <StepperSeparator className={cn("min-w-4 transition-colors duration-500", step.done && "bg-primary/60")} /> : null}
              </StepperItem>
            )
          })}
        </StepperNav>

        <StepperPanel>
          {steps.map((step, index) => {
            const number = index + 1
            const last = number === steps.length
            return (
              <StepperContent key={step.key} value={number} forceMount>
                <motion.div
                  role="tabpanel"
                  id={`stepper-panel-${number}`}
                  aria-labelledby={`stepper-tab-${number}`}
                  initial={false}
                  animate={active === number ? { opacity: 1, y: 0 } : { opacity: 0, y: 6 }}
                  transition={{ duration: 0.24, ease: EASE }}
                >
                  <Frame>
                    <FrameHeader className="gap-1">
                      <FrameTitle className="flex flex-wrap items-center gap-2">
                        <h2>{step.title}</h2>
                        {step.done ? <Badge variant="success-light" size="sm"><CheckIcon aria-hidden /> {t("done")}</Badge> : null}
                        {step.note ? <span className="text-xs font-normal text-muted-foreground">{step.note}</span> : null}
                      </FrameTitle>
                      <FrameDescription className="text-pretty">{step.why}</FrameDescription>
                    </FrameHeader>
                    {step.bare ? step.content : <FramePanel className="grid gap-3">{step.content}</FramePanel>}
                    <FrameFooter className="flex-row items-center justify-between">
                      <Button type="button" variant="ghost" size="sm" disabled={number === 1} onClick={() => setActive(number - 1)}>
                        <ChevronLeftIcon className="rtl:rotate-180" /> {t("back")}
                      </Button>
                      {last ? (
                        <Button size="sm" variant={step.done ? "default" : "outline"} nativeButton={false} render={<Link href="/" />}>
                          {t("dashboard")} <ChevronRightIcon className="rtl:rotate-180" />
                        </Button>
                      ) : (
                        <Button type="button" size="sm" variant={step.done ? "default" : "outline"} onClick={() => setActive(number + 1)}>
                          {step.done ? t("continue") : t("later")} <ChevronRightIcon className="rtl:rotate-180" />
                        </Button>
                      )}
                    </FrameFooter>
                  </Frame>
                </motion.div>
              </StepperContent>
            )
          })}
        </StepperPanel>
      </Stepper>
    </MotionConfig>
  )
}

/** A way forward inside a step, or an extra that can wait. */
export function SetupChoice({ href, icon, title, text, done, doneLabel }: { href: string; icon: ReactNode; title: string; text: string; done?: boolean; doneLabel?: string }) {
  return (
    <Link href={href} className="group flex items-start gap-3 rounded-lg border bg-background p-3 text-sm transition-[background-color,border-color,transform] duration-200 ease-out outline-none hover:border-foreground/20 hover:bg-muted/40 focus-visible:ring-3 focus-visible:ring-ring/50 active:scale-[0.99] motion-reduce:transform-none">
      <IconTile variant={done ? "soft" : "frame"} size="sm" className={cn("transition-transform duration-200 ease-out group-hover:-translate-y-px motion-reduce:transform-none", done && "text-success")}>
        {done ? <CheckIcon aria-hidden /> : icon}
      </IconTile>
      <span className="grid min-w-0 gap-0.5">
        <span className="flex flex-wrap items-center gap-2 font-medium">
          {title}
          {done && doneLabel ? <Badge variant="success-light" size="sm">{doneLabel}</Badge> : null}
        </span>
        <span className="text-xs text-pretty text-muted-foreground">{text}</span>
      </span>
    </Link>
  )
}

/** Sections arrive one after the other, once, when the guide opens. */
export function Reveal({ order = 0, className, children }: { order?: number; className?: string; children: ReactNode }) {
  return (
    <MotionConfig reducedMotion="user">
      <motion.div className={className} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.32, ease: EASE, delay: order * 0.05 }}>
        {children}
      </motion.div>
    </MotionConfig>
  )
}

/** How far along the guide is; turns green when nothing is left. */
export function ProgressBadge({ complete, children }: { complete: boolean; children: ReactNode }) {
  return <Badge variant={complete ? "success-light" : "outline"} size="lg" className="tabular-nums transition-colors duration-300">{children}</Badge>
}
