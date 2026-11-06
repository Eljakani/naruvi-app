"use client"

import { useState, useTransition } from "react"
import { PlusIcon, TagIcon, XIcon } from "lucide-react"
import { toast } from "sonner"
import { setJobTagsAction } from "@/app/(app)/jobs/actions"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverDescription, PopoverHeader, PopoverTitle, PopoverTrigger } from "@/components/ui/popover"
import { cleanTags } from "@/lib/similar"

/** Your own labels for a job ("Paris cloud", "Plan B"); suggestions come from tags already in use. */
export function JobTags({ jobId, tags, suggestions }: { jobId: string; tags: string[]; suggestions: string[] }) {
  const [current, setCurrent] = useState(tags)
  const [draft, setDraft] = useState("")
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()

  const save = (next: string[]) => {
    const clean = cleanTags(next)
    const previous = current
    setCurrent(clean)
    startTransition(async () => {
      const result = await setJobTagsAction(jobId, clean)
      if (!result.ok) {
        setCurrent(previous)
        toast.error(result.error)
      }
    })
  }
  const add = (tag: string) => {
    if (!tag.trim()) return
    save([...current, tag])
    setDraft("")
  }
  const unused = suggestions.filter((tag) => !current.some((item) => item.toLowerCase() === tag.toLowerCase()) && tag.toLowerCase().includes(draft.trim().toLowerCase())).slice(0, 8)

  return (
    <div className="flex flex-wrap items-center gap-1.5" aria-busy={pending}>
      <TagIcon className="size-3.5 text-muted-foreground" aria-hidden />
      {current.map((tag) => (
        <Badge key={tag} variant="secondary" className="gap-1 pr-1 font-normal">
          {tag}
          <button type="button" className="rounded-sm opacity-60 hover:opacity-100" aria-label={`Remove tag ${tag}`} onClick={() => save(current.filter((item) => item !== tag))}>
            <XIcon className="size-3" />
          </button>
        </Badge>
      ))}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger render={<Button variant="ghost" size="xs" className="text-muted-foreground" />}>
          <PlusIcon /> {current.length ? "Tag" : "Add a tag"}
        </PopoverTrigger>
        <PopoverContent align="start" className="w-72">
          <PopoverHeader>
            <PopoverTitle>Tags</PopoverTitle>
            <PopoverDescription>Group jobs your own way, for example by search or priority. Filter by tag on the Jobs page.</PopoverDescription>
          </PopoverHeader>
          <form
            className="flex gap-2"
            onSubmit={(event) => {
              event.preventDefault()
              add(draft)
            }}
          >
            <Input autoFocus value={draft} maxLength={40} placeholder="New tag" aria-label="New tag" onChange={(event) => setDraft(event.target.value)} />
            <Button type="submit" size="sm" disabled={!draft.trim()}>
              Add
            </Button>
          </form>
          {unused.length ? (
            <div className="flex flex-wrap gap-1">
              {unused.map((tag) => (
                <Button key={tag} type="button" size="xs" variant="outline" className="font-normal" onClick={() => add(tag)}>
                  {tag}
                </Button>
              ))}
            </div>
          ) : null}
        </PopoverContent>
      </Popover>
    </div>
  )
}
