"use client"

import { motion, useReducedMotion } from "motion/react"
import { PresenceItem, PresenceList } from "@/components/presence"
import { useRef, useState } from "react"
import { CheckIcon, LinkIcon, PlusIcon, XIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { Kbd } from "@/components/ui/kbd"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"

const EASE = [0.23, 1, 0.32, 1] as const

/** Auto-growing textarea without scrollbars. */
export function GrowText({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      rows={1}
      className={cn(
        "field-sizing-content min-h-9 w-full resize-none rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none transition-[color,box-shadow,background-color,border-color] placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30",
        className,
      )}
      {...props}
    />
  )
}

/** Quiet text field: no frame until you hover or type in it, so a long list reads like a document. */
export const QUIET =
  "border-transparent bg-transparent shadow-none hover:bg-muted/50 focus-visible:border-ring focus-visible:bg-background dark:bg-transparent dark:hover:bg-input/20 dark:focus-visible:bg-input/30"

type Item = { key: string; text: string }

/**
 * Keyboard-first list of short statements.
 * Enter → new line below · Backspace on empty → remove · ↑/↓ at the edges → move between lines
 * · Alt+↑/↓ → reorder · paste lines → split.
 */
export function LineList({
  items,
  onChange,
  placeholder,
  addLabel,
  numbered = false,
  renderAside,
  renderBelow,
  onHover,
  empty,
}: {
  items: Item[]
  onChange: (items: Item[]) => void
  placeholder: string
  addLabel: string
  numbered?: boolean
  /** Right of the line (status, quick actions). */
  renderAside?: (item: Item) => React.ReactNode
  /** Under the line; `focused` is true while you type in it. */
  renderBelow?: (item: Item, focused: boolean) => React.ReactNode
  onHover?: (key: string | null) => void
  /** Shown instead of the list when there is nothing yet. */
  empty?: React.ReactNode
}) {
  const refs = useRef(new Map<string, HTMLTextAreaElement>())
  const [focused, setFocused] = useState<string | null>(null)
  const focus = (key?: string, at?: "start" | "end") =>
    requestAnimationFrame(() => {
      const node = key ? refs.current.get(key) : undefined
      if (!node) return
      node.focus()
      if (at) node.setSelectionRange(at === "start" ? 0 : node.value.length, at === "start" ? 0 : node.value.length)
    })
  const add = (afterIndex = items.length - 1, text = "") => {
    const item = { key: crypto.randomUUID(), text }
    onChange([...items.slice(0, afterIndex + 1), item, ...items.slice(afterIndex + 1)])
    focus(item.key)
  }
  const move = (index: number, by: -1 | 1) => {
    const target = index + by
    if (target < 0 || target >= items.length) return
    const next = [...items]
    ;[next[index], next[target]] = [next[target], next[index]]
    onChange(next)
    focus(items[index].key)
  }
  if (!items.length && empty) return <div className="cb-fade">{empty}</div>
  return (
    <div className="grid gap-0.5">
      <PresenceList>
        {items.map((item, index) => (
          <PresenceItem key={item.key} className="group/line" onMouseEnter={() => onHover?.(item.key)} onMouseLeave={() => onHover?.(null)}>
            <div className="flex items-start gap-1.5">
              {numbered ? (
                <span className={cn("mt-2 w-6 shrink-0 text-right text-xs tabular-nums transition-colors", focused === item.key ? "font-medium text-foreground" : "text-muted-foreground/70")}>{index + 1}</span>
              ) : (
                <span className={cn("mt-[15px] ms-2 size-1.5 shrink-0 rounded-full transition-colors", focused === item.key ? "bg-foreground" : "bg-muted-foreground/40")} />
              )}
              <div className="min-w-0 flex-1">
                <GrowText
                  ref={(node) => {
                    if (node) refs.current.set(item.key, node)
                    else refs.current.delete(item.key)
                  }}
                  value={item.text}
                  placeholder={placeholder}
                  aria-label={`${addLabel} ${index + 1}`}
                  className={QUIET}
                  onFocus={() => setFocused(item.key)}
                  onBlur={() => setFocused((current) => (current === item.key ? null : current))}
                  onChange={(event) => onChange(items.map((current) => (current.key === item.key ? { ...current, text: event.target.value } : current)))}
                  onKeyDown={(event) => {
                    const node = event.currentTarget
                    if (event.nativeEvent.isComposing) return
                    if (event.altKey && (event.key === "ArrowUp" || event.key === "ArrowDown")) {
                      event.preventDefault()
                      move(index, event.key === "ArrowUp" ? -1 : 1)
                    } else if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault()
                      add(index)
                    } else if (event.key === "Backspace" && !item.text) {
                      event.preventDefault()
                      onChange(items.filter((current) => current.key !== item.key))
                      focus(items[index - 1]?.key ?? items[index + 1]?.key, "end")
                    } else if (event.key === "ArrowUp" && node.selectionStart === 0 && node.selectionEnd === 0 && index > 0) {
                      event.preventDefault()
                      focus(items[index - 1].key, "end")
                    } else if (event.key === "ArrowDown" && node.selectionStart === node.value.length && index < items.length - 1) {
                      event.preventDefault()
                      focus(items[index + 1].key, "start")
                    }
                  }}
                  onPaste={(event) => {
                    const lines = event.clipboardData
                      .getData("text")
                      .split(/\r?\n/)
                      .map((line) => line.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "").trim())
                      .filter(Boolean)
                    if (lines.length < 2) return
                    event.preventDefault()
                    const [first, ...rest] = lines
                    const created = rest.map((text) => ({ key: crypto.randomUUID(), text }))
                    onChange([...items.slice(0, index), { ...item, text: `${item.text}${first}` }, ...created, ...items.slice(index + 1)])
                    focus(created.at(-1)?.key, "end")
                  }}
                />
              </div>
              {renderAside ? <div className="mt-1 flex shrink-0 items-center gap-1">{renderAside(item)}</div> : null}
              <Button
                size="icon-sm"
                variant="ghost"
                className="mt-1 text-muted-foreground opacity-0 transition-opacity group-hover/line:opacity-100 focus-visible:opacity-100 pointer-coarse:opacity-100"
                aria-label={`Remove line ${index + 1}`}
                onClick={() => onChange(items.filter((current) => current.key !== item.key))}
              >
                <XIcon />
              </Button>
            </div>
            {renderBelow ? <div className={cn(numbered ? "ps-[1.875rem]" : "ps-5", "pe-10")}>{renderBelow(item, focused === item.key)}</div> : null}
          </PresenceItem>
        ))}
      </PresenceList>
      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
        <Button variant="ghost" size="sm" className="w-fit text-muted-foreground" onClick={() => add()}>
          <PlusIcon /> {addLabel}
        </Button>
        {items.length > 1 ? (
          <span className="hidden items-center gap-1 text-[11px] text-muted-foreground/80 sm:inline-flex">
            <Kbd>Enter</Kbd> new line <span aria-hidden>·</span> <Kbd>Alt ↑↓</Kbd> reorder <span aria-hidden>·</span> paste a list to split it
          </span>
        ) : null}
      </div>
    </div>
  )
}

/** Tag-style input: Enter, comma or paste adds; Backspace on empty removes the last one. */
export function ChipInput({ values, onChange, placeholder, label }: { values: string[]; onChange: (values: string[]) => void; placeholder: string; label?: string }) {
  const [text, setText] = useState("")
  const add = (raw: string) => {
    const seen = new Set(values.map((value) => value.toLowerCase()))
    const parts = raw
      .split(/[,\n;]/)
      .map((part) => part.trim())
      .filter((part) => part && !seen.has(part.toLowerCase()) && (seen.add(part.toLowerCase()), true))
    if (parts.length) onChange([...values, ...parts])
  }
  const commit = () => {
    add(text)
    setText("")
  }
  return (
    <div className="flex min-h-10 cursor-text flex-wrap items-center gap-1.5 rounded-lg border border-input px-2 py-1.5 transition-[border-color,box-shadow] focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50 dark:bg-input/30" onClick={(event) => event.currentTarget.querySelector("input")?.focus()}>
      <PresenceList>
        {values.map((value) => (
          <motion.span
            key={value}
            layout="position"
            initial={{ opacity: 0, scale: 0.85 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.85 }}
            transition={{ duration: 0.16, ease: EASE }}
            className="inline-flex h-6 items-center gap-1 rounded-md bg-secondary ps-2 pe-0.5 text-xs font-medium text-secondary-foreground"
          >
            {value}
            <button type="button" aria-label={`Remove ${value}`} className="grid size-5 place-content-center rounded-sm text-muted-foreground hover:bg-foreground/10 hover:text-foreground" onClick={() => onChange(values.filter((item) => item !== value))}>
              <XIcon className="size-3" />
            </button>
          </motion.span>
        ))}
      </PresenceList>
      <input
        value={text}
        aria-label={label}
        onChange={(event) => setText(event.target.value)}
        onBlur={commit}
        onPaste={(event) => {
          const pasted = event.clipboardData.getData("text")
          if (!/[,\n;]/.test(pasted)) return
          event.preventDefault()
          add(`${text}${pasted}`)
          setText("")
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === ",") {
            event.preventDefault()
            commit()
          } else if (event.key === "Backspace" && !text && values.length) onChange(values.slice(0, -1))
        }}
        placeholder={values.length ? "Add more…" : placeholder}
        className="h-6 min-w-32 flex-1 bg-transparent px-1 text-sm outline-none placeholder:text-muted-foreground"
      />
    </div>
  )
}

/**
 * One-click suggestions under an input: dashed chips that fly in and leave when taken.
 * `source` says where they come from ("In your facts", "Naruvi").
 */
export function SuggestChips({ items, onAdd, source, icon }: { items: string[]; onAdd: (items: string[]) => void; source: string; icon?: React.ReactNode }) {
  const reduce = useReducedMotion()
  if (!items.length) return null
  return (
    <div className="cb-fade flex flex-wrap items-center gap-1.5">
      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
        {icon}
        {source}
      </span>
      <PresenceList>
        {items.map((item, index) => (
          <motion.button
            key={item}
            type="button"
            layout="position"
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0, transition: { duration: 0.18, ease: EASE, delay: reduce ? 0 : Math.min(index, 8) * 0.025 } }}
            exit={{ opacity: 0, scale: 0.85, transition: { duration: 0.12 } }}
            onClick={() => onAdd([item])}
            className="inline-flex min-h-6 items-center gap-1 rounded-md border border-dashed py-0.5 text-start border-foreground/20 px-1.5 text-xs text-muted-foreground transition-colors hover:border-solid hover:border-foreground/30 hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
          >
            <PlusIcon className="size-3" />
            {item}
          </motion.button>
        ))}
      </PresenceList>
      {items.length > 1 ? (
        <Button size="xs" variant="ghost" className="text-muted-foreground" onClick={() => onAdd(items)}>
          Add all
        </Button>
      ) : null}
    </div>
  )
}

/** Searchable multi-select of facts for a bullet. Facts keep their number from the list above. */
export function FactPicker({ facts, selected, onChange }: { facts: { key: string; statement: string }[]; selected: string[]; onChange: (keys: string[]) => void }) {
  return (
    <Popover>
      <PopoverTrigger render={<Button size="xs" variant="ghost" className="text-muted-foreground" />}>
        <LinkIcon /> {selected.length ? "Link another" : "Link a fact"}
      </PopoverTrigger>
      <PopoverContent className="w-[26rem] max-w-[calc(100vw-2rem)] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search facts…" />
          <CommandList>
            <CommandEmpty>{facts.some((fact) => fact.statement.trim()) ? "No fact matches." : "Add facts in “What you did” first."}</CommandEmpty>
            <CommandGroup>
              {facts.map((fact, index) => {
                if (!fact.statement.trim()) return null
                const checked = selected.includes(fact.key)
                return (
                  <CommandItem key={fact.key} value={`${fact.statement} ${fact.key}`} onSelect={() => onChange(checked ? selected.filter((key) => key !== fact.key) : [...selected, fact.key])} className="items-start">
                    <CheckIcon className={cn("mt-0.5", checked ? "opacity-100" : "opacity-0")} />
                    <span className="mt-px w-4 shrink-0 text-xs text-muted-foreground tabular-nums">{index + 1}</span>
                    <span className="text-sm">{fact.statement}</span>
                  </CommandItem>
                )
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

/** LineList over plain strings, with stable keys kept locally (and resynced when the parent adds or removes values). */
export function StringLineList({ values, onChange, ...props }: { values: string[]; onChange: (values: string[]) => void } & Omit<React.ComponentProps<typeof LineList>, "items" | "onChange">) {
  const [items, setItems] = useState(() => values.map((text) => ({ key: crypto.randomUUID(), text })))
  if (items.length !== values.length || items.some((item, index) => item.text !== values[index])) {
    setItems(values.map((text, index) => ({ key: items[index]?.key ?? crypto.randomUUID(), text })))
  }
  return (
    <LineList
      {...props}
      items={items}
      onChange={(next) => {
        setItems(next)
        onChange(next.map((item) => item.text))
      }}
    />
  )
}
