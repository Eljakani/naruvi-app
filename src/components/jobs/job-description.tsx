"use client"

import { useMemo, useState } from "react"
import { ChevronDownIcon, ChevronUpIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { inlineParts, leadLabel, parseJobText, type Block } from "@/lib/job-text"

/** "REQUIREMENTS" → "Requirements"; leaves acronyms inside normal text alone. */
function displayHeading(text: string) {
  const letters = text.replace(/[^A-Za-zÀ-ÿ]/g, "")
  if (letters.length < 4 || letters !== letters.toUpperCase()) return text
  const lower = text.toLowerCase()
  return lower.charAt(0).toUpperCase() + lower.slice(1)
}

function Inline({ text }: { text: string }) {
  return (
    <>
      {inlineParts(text).map((part, index) => {
        if (part.type === "bold") return <strong key={index} className="font-semibold text-foreground">{part.value}</strong>
        if (part.type === "link")
          return (
            <a key={index} href={part.value} target="_blank" rel="noopener noreferrer nofollow" className="break-all text-primary underline underline-offset-2 hover:opacity-80">
              {part.value.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "")}
            </a>
          )
        if (part.type === "email")
          return (
            <a key={index} href={`mailto:${part.value}`} className="text-primary underline underline-offset-2 hover:opacity-80">
              {part.value}
            </a>
          )
        return <span key={index}>{part.value}</span>
      })}
    </>
  )
}

function ListItem({ text }: { text: string }) {
  const lead = leadLabel(text)
  if (!lead) return <Inline text={text} />
  return (
    <>
      <span className="font-medium text-foreground">{lead.label}</span>
      <span className="text-muted-foreground"> — </span>
      <Inline text={lead.rest} />
    </>
  )
}

function BlockView({ block }: { block: Block }) {
  if (block.type === "heading") {
    return (
      <h3 id={block.id} className="mt-7 mb-2 scroll-mt-24 text-[15px] font-semibold tracking-tight text-foreground first:mt-0">
        {displayHeading(block.text)}
      </h3>
    )
  }
  if (block.type === "list") {
    const Tag = block.ordered ? "ol" : "ul"
    return (
      <Tag className={cn("my-3 grid gap-2 pl-5", block.ordered ? "list-decimal marker:text-muted-foreground" : "list-disc marker:text-muted-foreground/60")}>
        {block.items.map((item, index) => (
          <li key={index} className="pl-1">
            <ListItem text={item} />
          </li>
        ))}
      </Tag>
    )
  }
  return (
    <p className="my-3 first:mt-0">
      <Inline text={block.text} />
    </p>
  )
}

/**
 * Readable rendering of any job description: plain text, markdown-ish,
 * scraped HTML-turned-text. Never renders raw HTML.
 */
export function JobDescription({ text, collapsible = true, className }: { text: string; collapsible?: boolean; className?: string }) {
  const blocks = useMemo(() => parseJobText(text), [text])
  const headings = blocks.filter((block): block is Extract<Block, { type: "heading" }> => block.type === "heading")
  const long = collapsible && text.length > 2400
  const [expanded, setExpanded] = useState(!long)

  if (!blocks.length) return <p className="text-sm text-muted-foreground">No description.</p>

  return (
    <div className={cn("grid gap-4", className)}>
      {headings.length >= 3 ? (
        <nav aria-label="Sections" className="flex flex-wrap gap-1.5">
          {headings.map((heading) => (
            <button
              key={heading.id}
              type="button"
              onClick={() => {
                setExpanded(true)
                requestAnimationFrame(() => document.getElementById(heading.id)?.scrollIntoView({ behavior: "smooth", block: "start" }))
              }}
              className="rounded-full border px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground"
            >
              {displayHeading(heading.text)}
            </button>
          ))}
        </nav>
      ) : null}
      <div className="relative">
        <article className={cn("max-w-[72ch] text-sm leading-7 text-foreground/85 [overflow-wrap:anywhere]", !expanded && "max-h-[28rem] overflow-hidden")}>
          {blocks.map((block, index) => (
            <BlockView key={index} block={block} />
          ))}
        </article>
        {!expanded ? <div className="pointer-events-none absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-card to-transparent" /> : null}
      </div>
      {long ? (
        <Button variant="outline" size="sm" className="w-fit" onClick={() => setExpanded(!expanded)}>
          {expanded ? <ChevronUpIcon /> : <ChevronDownIcon />} {expanded ? "Show less" : "Show full description"}
        </Button>
      ) : null}
    </div>
  )
}
