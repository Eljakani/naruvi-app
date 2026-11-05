"use client"

import { useRef, useState } from "react"
import { CheckIcon, LinkIcon, PlusIcon, XIcon } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"

/** Auto-growing textarea without scrollbars. */
export function GrowText({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      rows={1}
      className={cn(
        "field-sizing-content min-h-9 w-full resize-none rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none transition-[color,box-shadow] placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30",
        className,
      )}
      {...props}
    />
  )
}

/**
 * Keyboard-first list of short statements.
 * Enter → new line below · Backspace on empty → remove · paste lines → split.
 */
export function LineList({
  items,
  onChange,
  placeholder,
  addLabel,
  numbered = false,
  renderMeta,
  onHover,
}: {
  items: { key: string; text: string }[]
  onChange: (items: { key: string; text: string }[]) => void
  placeholder: string
  addLabel: string
  numbered?: boolean
  renderMeta?: (key: string) => React.ReactNode
  onHover?: (key: string | null) => void
}) {
  const refs = useRef(new Map<string, HTMLTextAreaElement>())
  const focus = (key?: string) => requestAnimationFrame(() => key && refs.current.get(key)?.focus())
  const add = (afterIndex = items.length - 1, text = "") => {
    const item = { key: crypto.randomUUID(), text }
    const next = [...items.slice(0, afterIndex + 1), item, ...items.slice(afterIndex + 1)]
    onChange(next)
    focus(item.key)
  }
  return (
    <div className="grid gap-1.5">
      {items.map((item, index) => (
        <div key={item.key} className="group flex items-start gap-2" onMouseEnter={() => onHover?.(item.key)} onMouseLeave={() => onHover?.(null)}>
          {numbered ? <span className="mt-2 w-5 shrink-0 text-right text-xs text-muted-foreground tabular-nums">{index + 1}</span> : <span className="mt-4 size-1.5 shrink-0 rounded-full bg-muted-foreground/40" />}
          <div className="min-w-0 flex-1">
            <GrowText
              ref={(node) => {
                if (node) refs.current.set(item.key, node)
                else refs.current.delete(item.key)
              }}
              value={item.text}
              placeholder={placeholder}
              aria-label={`${addLabel} ${index + 1}`}
              onChange={(event) => onChange(items.map((current) => (current.key === item.key ? { ...current, text: event.target.value } : current)))}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                  event.preventDefault()
                  add(index)
                } else if (event.key === "Backspace" && !item.text && items.length > 0) {
                  event.preventDefault()
                  onChange(items.filter((current) => current.key !== item.key))
                  focus(items[index - 1]?.key ?? items[index + 1]?.key)
                }
              }}
              onPaste={(event) => {
                const lines = event.clipboardData
                  .getData("text")
                  .split(/\r?\n/)
                  .map((line) => line.replace(/^\s*[-*•]\s*/, "").trim())
                  .filter(Boolean)
                if (lines.length < 2) return
                event.preventDefault()
                const [first, ...rest] = lines
                const created = rest.map((text) => ({ key: crypto.randomUUID(), text }))
                const merged = { ...item, text: `${item.text}${first}` }
                onChange([...items.slice(0, index), merged, ...created, ...items.slice(index + 1)])
                focus(created.at(-1)?.key)
              }}
            />
            {renderMeta ? <div className="mt-1 min-h-0 text-xs">{renderMeta(item.key)}</div> : null}
          </div>
          <Button size="icon-sm" variant="ghost" className="mt-1 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100" aria-label="Remove" onClick={() => onChange(items.filter((current) => current.key !== item.key))}>
            <XIcon />
          </Button>
        </div>
      ))}
      <Button variant="ghost" size="sm" className="w-fit text-muted-foreground" onClick={() => add()}>
        <PlusIcon /> {addLabel}
      </Button>
    </div>
  )
}

/** Tag-style input: Enter or comma adds, × removes. */
export function ChipInput({ values, onChange, placeholder }: { values: string[]; onChange: (values: string[]) => void; placeholder: string }) {
  const [text, setText] = useState("")
  const commit = () => {
    const parts = text
      .split(",")
      .map((part) => part.trim())
      .filter((part) => part && !values.includes(part))
    if (parts.length) onChange([...values, ...parts])
    setText("")
  }
  return (
    <div className="flex min-h-9 flex-wrap items-center gap-1.5 rounded-md border border-input px-2 py-1.5 focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50">
      {values.map((value) => (
        <Badge key={value} variant="secondary" className="gap-1 pr-1">
          {value}
          <button type="button" aria-label={`Remove ${value}`} className="rounded-sm opacity-60 hover:opacity-100" onClick={() => onChange(values.filter((item) => item !== value))}>
            <XIcon className="size-3" />
          </button>
        </Badge>
      ))}
      <Input
        value={text}
        onChange={(event) => setText(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === ",") {
            event.preventDefault()
            commit()
          } else if (event.key === "Backspace" && !text && values.length) onChange(values.slice(0, -1))
        }}
        placeholder={values.length ? "" : placeholder}
        className="h-6 min-w-32 flex-1 border-0 p-0 shadow-none focus-visible:ring-0 dark:bg-transparent"
      />
    </div>
  )
}

/** Searchable multi-select of facts for a bullet. */
export function FactPicker({ facts, selected, onChange }: { facts: { key: string; statement: string }[]; selected: string[]; onChange: (keys: string[]) => void }) {
  const usable = facts.filter((fact) => fact.statement.trim())
  return (
    <Popover>
      <PopoverTrigger render={<Button size="xs" variant="ghost" className="text-muted-foreground" />}>
        <LinkIcon /> Link fact
      </PopoverTrigger>
      <PopoverContent className="w-[26rem] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search facts…" />
          <CommandList>
            <CommandEmpty>{usable.length ? "No fact matches." : "Add facts in section 3 first."}</CommandEmpty>
            <CommandGroup>
              {usable.map((fact) => {
                const checked = selected.includes(fact.key)
                return (
                  <CommandItem key={fact.key} value={`${fact.statement} ${fact.key}`} onSelect={() => onChange(checked ? selected.filter((key) => key !== fact.key) : [...selected, fact.key])} className="items-start">
                    <CheckIcon className={cn("mt-0.5", checked ? "opacity-100" : "opacity-0")} />
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

/** LineList over plain strings, with stable keys kept locally. */
export function StringLineList({ values, onChange, ...props }: { values: string[]; onChange: (values: string[]) => void } & Omit<React.ComponentProps<typeof LineList>, "items" | "onChange">) {
  const [items, setItems] = useState(() => values.map((text) => ({ key: crypto.randomUUID(), text })))
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
