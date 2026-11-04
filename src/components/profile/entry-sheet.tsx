"use client"

import { useMemo, useState, useTransition } from "react"
import { AlertTriangleIcon, CheckCircle2Icon, LinkIcon, LockIcon, PlusIcon, TrashIcon } from "lucide-react"
import { toast } from "sonner"
import { deleteEntryAction, saveEntryAction } from "@/app/(app)/profile/actions"
import { KIND_SINGULAR, STATUS_LABELS } from "@/components/profile/labels"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { verifySupport } from "@/server/domain/grounding"
import { entryKinds, entryStatuses } from "@/server/profile/schemas"
import type { ProfileEntry } from "@/server/profile/repository"

type DraftFact = { key: string; statement: string }
type DraftPhrasing = { key: string; group: string; role: "bullet" | "label"; language: string; text: string; factKeys: string[] }
type Draft = {
  title: string
  kind: (typeof entryKinds)[number]
  status: (typeof entryStatuses)[number]
  display: Record<"en" | "fr", { role: string; organization: string; dates: string; location: string }>
  tags: string
  skills: string
  evidence: string
  doNotClaim: string
  confidential: boolean
  facts: DraftFact[]
  phrasings: DraftPhrasing[]
}

const key = () => crypto.randomUUID()
const emptyDisplay = () => ({ role: "", organization: "", dates: "", location: "" })

function toDraft(entry: ProfileEntry | null): Draft {
  if (!entry) {
    return {
      title: "",
      kind: "experience",
      status: "needs_review",
      display: { en: emptyDisplay(), fr: emptyDisplay() },
      tags: "",
      skills: "",
      evidence: "",
      doNotClaim: "",
      confidential: false,
      facts: [{ key: key(), statement: "" }],
      phrasings: [],
    }
  }
  return {
    title: entry.title,
    kind: entry.kind,
    status: entry.status,
    display: {
      en: { ...emptyDisplay(), ...entry.display.en },
      fr: { ...emptyDisplay(), ...entry.display.fr },
    } as Draft["display"],
    tags: entry.tags.join(", "),
    skills: entry.skills.join("\n"),
    evidence: entry.evidence.join("\n"),
    doNotClaim: entry.doNotClaim.join("\n"),
    confidential: entry.confidential,
    facts: entry.facts.map((fact) => ({ key: fact.id, statement: fact.statement })),
    phrasings: entry.phrasings.map((phrasing) => ({
      key: phrasing.id,
      group: phrasing.group,
      role: phrasing.role,
      language: phrasing.language,
      text: phrasing.text,
      factKeys: phrasing.factIds,
    })),
  }
}

export function EntrySheet({ entry, onClose }: { entry: ProfileEntry | "new" | null; onClose: () => void }) {
  const open = entry !== null
  const source = entry === "new" ? null : entry
  const [draft, setDraft] = useState<Draft>(() => toDraft(source))
  const [tab, setTab] = useState("overview")
  const [pending, startTransition] = useTransition()

  const patch = (value: Partial<Draft>) => setDraft((current) => ({ ...current, ...value }))
  const factsForCheck = draft.facts.filter((fact) => fact.statement.trim()).map((fact) => ({ id: fact.key, statement: fact.statement }))
  const grounding = useMemo(
    () =>
      Object.fromEntries(
        draft.phrasings.map((phrasing) => [
          phrasing.key,
          phrasing.role === "label" ? { grounded: true, unsupportedNumbers: [] as string[], factIds: [] } : verifySupport(phrasing.text, factsForCheck.filter((fact) => phrasing.factKeys.includes(fact.id))),
        ]),
      ),
    [draft.phrasings, factsForCheck],
  )
  const ungrounded = draft.phrasings.filter((phrasing) => !grounding[phrasing.key]?.grounded).length
  const groups = [...new Set(draft.phrasings.map((phrasing) => phrasing.group))]

  const save = () =>
    startTransition(async () => {
      const facts = draft.facts.filter((fact) => fact.statement.trim())
      const index = new Map(facts.map((fact, i) => [fact.key, i]))
      const split = (value: string, separator: RegExp) => value.split(separator).map((item) => item.trim()).filter(Boolean)
      const result = await saveEntryAction(
        {
          title: draft.title || draft.display.en.role || draft.display.fr.role,
          kind: draft.kind,
          status: draft.status,
          display: Object.fromEntries(
            Object.entries(draft.display)
              .map(([lang, display]) => [lang, Object.fromEntries(Object.entries(display).filter(([, value]) => value.trim()))])
              .filter(([, display]) => Object.keys(display).length),
          ),
          tags: split(draft.tags, /[,\n]/),
          skills: split(draft.skills, /\n/),
          evidence: split(draft.evidence, /\n/),
          doNotClaim: split(draft.doNotClaim, /\n/),
          confidential: draft.confidential,
          facts: facts.map((fact) => ({ statement: fact.statement })),
          phrasings: draft.phrasings
            .filter((phrasing) => phrasing.text.trim())
            .map((phrasing) => ({
              group: phrasing.group || "General",
              role: phrasing.role,
              language: phrasing.language,
              text: phrasing.text,
              factRefs: phrasing.factKeys.map((factKey) => index.get(factKey)).filter((value): value is number => value !== undefined),
            })),
        },
        source?.id,
      )
      if (!result.ok) return void toast.error("Could not save", { description: result.error })
      toast.success(source ? "Entry saved" : "Entry created", {
        description: ungrounded ? `${ungrounded} bullet(s) still need a supporting fact.` : "All bullets are grounded.",
      })
      onClose()
    })

  const remove = () =>
    startTransition(async () => {
      if (!source) return
      const result = await deleteEntryAction(source.id)
      if (!result.ok) return void toast.error("Could not delete", { description: result.error })
      toast.success("Entry deleted")
      onClose()
    })

  return (
    <Sheet open={open} onOpenChange={(next) => !next && onClose()}>
      <SheetContent className="w-full gap-0 data-[side=right]:w-full data-[side=right]:sm:max-w-2xl">
        <SheetHeader className="border-b">
          <SheetTitle>{source ? draft.display.en.role || draft.title : "New entry"}</SheetTitle>
          <SheetDescription>
            {KIND_SINGULAR[draft.kind]} · {STATUS_LABELS[draft.status]}
            {ungrounded ? ` · ${ungrounded} ungrounded bullet${ungrounded === 1 ? "" : "s"}` : ""}
          </SheetDescription>
        </SheetHeader>

        <Tabs value={tab} onValueChange={setTab} className="min-h-0 flex-1 gap-0">
          <TabsList className="mx-4 mt-3">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="facts">Facts {draft.facts.filter((fact) => fact.statement.trim()).length}</TabsTrigger>
            <TabsTrigger value="bullets" className="gap-1.5">
              Bullets {draft.phrasings.length}
              {ungrounded ? <AlertTriangleIcon className="size-3.5 text-amber-500" /> : null}
            </TabsTrigger>
            <TabsTrigger value="rules">Rules</TabsTrigger>
          </TabsList>

          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            <TabsContent value="overview" className="grid gap-5">
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="grid gap-2 sm:col-span-3">
                  <Label htmlFor="entry-title">Internal title</Label>
                  <Input id="entry-title" value={draft.title} onChange={(event) => patch({ title: event.target.value })} placeholder="Oracle Research & Development" />
                </div>
                <div className="grid gap-2">
                  <Label>Kind</Label>
                  <Select value={draft.kind} onValueChange={(value) => patch({ kind: value as Draft["kind"] })}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {entryKinds.map((kind) => (
                        <SelectItem key={kind} value={kind}>
                          {KIND_SINGULAR[kind]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label>Status</Label>
                  <Select value={draft.status} onValueChange={(value) => patch({ status: value as Draft["status"] })}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {entryStatuses.map((status) => (
                        <SelectItem key={status} value={status}>
                          {STATUS_LABELS[status]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <label className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2 sm:mt-auto">
                  <span className="flex items-center gap-1.5 text-sm">
                    <LockIcon className="size-3.5" /> NDA
                  </span>
                  <Switch checked={draft.confidential} onCheckedChange={(value) => patch({ confidential: value })} />
                </label>
              </div>
              {(["en", "fr"] as const).map((lang) => (
                <fieldset key={lang} className="grid gap-3 rounded-lg border p-4">
                  <legend className="px-1 text-xs font-medium text-muted-foreground">{lang === "en" ? "English display" : "French display"}</legend>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {(["role", "organization", "dates", "location"] as const).map((field) => (
                      <div key={field} className="grid gap-1.5">
                        <Label htmlFor={`${lang}-${field}`} className="text-xs capitalize">
                          {field}
                        </Label>
                        <Input
                          id={`${lang}-${field}`}
                          value={draft.display[lang][field]}
                          onChange={(event) => patch({ display: { ...draft.display, [lang]: { ...draft.display[lang], [field]: event.target.value } } })}
                        />
                      </div>
                    ))}
                  </div>
                </fieldset>
              ))}
              <div className="grid gap-2">
                <Label htmlFor="entry-tags">Tags</Label>
                <Input id="entry-tags" value={draft.tags} onChange={(event) => patch({ tags: event.target.value })} placeholder="devsecops, cloud, oci" />
                <p className="text-xs text-muted-foreground">Used to match entries to job requirements.</p>
              </div>
            </TabsContent>

            <TabsContent value="facts" className="grid gap-3">
              <p className="text-sm text-muted-foreground">One verifiable truth per line. Keep numbers exactly as you can prove them; bullets may only use numbers that appear here.</p>
              {draft.facts.map((fact, index) => (
                <div key={fact.key} className="flex items-start gap-2">
                  <span className="mt-2 w-5 shrink-0 text-right text-xs text-muted-foreground tabular-nums">{index + 1}</span>
                  <Textarea
                    aria-label={`Fact ${index + 1}`}
                    value={fact.statement}
                    rows={1}
                    className="min-h-9"
                    onChange={(event) => patch({ facts: draft.facts.map((item) => (item.key === fact.key ? { ...item, statement: event.target.value } : item)) })}
                  />
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label="Remove fact"
                    onClick={() =>
                      patch({
                        facts: draft.facts.filter((item) => item.key !== fact.key),
                        phrasings: draft.phrasings.map((phrasing) => ({ ...phrasing, factKeys: phrasing.factKeys.filter((k) => k !== fact.key) })),
                      })
                    }
                  >
                    <TrashIcon />
                  </Button>
                </div>
              ))}
              <Button variant="outline" size="sm" className="w-fit" onClick={() => patch({ facts: [...draft.facts, { key: key(), statement: "" }] })}>
                <PlusIcon /> Add fact
              </Button>
            </TabsContent>

            <TabsContent value="bullets" className="grid gap-5">
              <p className="text-sm text-muted-foreground">Approved wording, per language. Each bullet links to the facts that prove it; a number not found in a linked fact is flagged.</p>
              {groups.map((group) => (
                <div key={group} className="grid gap-2">
                  <div className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{group}</div>
                  {draft.phrasings
                    .filter((phrasing) => phrasing.group === group)
                    .map((phrasing) => {
                      const check = grounding[phrasing.key]
                      return (
                        <div key={phrasing.key} className="grid gap-2 rounded-lg border p-3">
                          <div className="flex items-start gap-2">
                            <Badge variant="outline" className="mt-1.5 font-mono text-[10px] uppercase">
                              {phrasing.language}
                            </Badge>
                            <Textarea
                              aria-label="Bullet text"
                              value={phrasing.text}
                              rows={2}
                              onChange={(event) => patch({ phrasings: draft.phrasings.map((item) => (item.key === phrasing.key ? { ...item, text: event.target.value } : item)) })}
                            />
                            <Button size="icon" variant="ghost" aria-label="Remove bullet" onClick={() => patch({ phrasings: draft.phrasings.filter((item) => item.key !== phrasing.key) })}>
                              <TrashIcon />
                            </Button>
                          </div>
                          <div className="flex flex-wrap items-center gap-2 pl-10 text-xs">
                            {phrasing.role === "label" ? (
                              <span className="text-muted-foreground">Label — not a claim</span>
                            ) : check?.grounded ? (
                              <span className="inline-flex items-center gap-1 text-emerald-600">
                                <CheckCircle2Icon className="size-3.5" /> Backed by {phrasing.factKeys.length} fact{phrasing.factKeys.length === 1 ? "" : "s"}
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-amber-600">
                                <AlertTriangleIcon className="size-3.5" />
                                {check?.unsupportedNumbers.length ? `Unbacked number${check.unsupportedNumbers.length === 1 ? "" : "s"}: ${check.unsupportedNumbers.join(", ")}` : "Link at least one supporting fact"}
                              </span>
                            )}
                            {phrasing.role === "bullet" ? (
                              <FactPicker
                                facts={draft.facts}
                                selected={phrasing.factKeys}
                                onChange={(factKeys) => patch({ phrasings: draft.phrasings.map((item) => (item.key === phrasing.key ? { ...item, factKeys } : item)) })}
                              />
                            ) : null}
                          </div>
                        </div>
                      )
                    })}
                </div>
              ))}
              <div className="flex flex-wrap gap-2">
                {["en", "fr"].map((language) => (
                  <Button
                    key={language}
                    variant="outline"
                    size="sm"
                    onClick={() => patch({ phrasings: [...draft.phrasings, { key: key(), group: groups.at(-1) ?? "General", role: "bullet", language, text: "", factKeys: [] }] })}
                  >
                    <PlusIcon /> {language.toUpperCase()} bullet
                  </Button>
                ))}
              </div>
            </TabsContent>

            <TabsContent value="rules" className="grid gap-5">
              <TextList id="do-not-claim" label="Do not claim" hint="Sent to every prompt as a hard constraint. One rule per line." value={draft.doNotClaim} onChange={(value) => patch({ doNotClaim: value })} />
              <TextList id="skills" label="Skills" hint="One per line. Only list what this entry proves." value={draft.skills} onChange={(value) => patch({ skills: value })} />
              <TextList id="evidence" label="Evidence" hint="Where this can be verified (links, documents, entry ids)." value={draft.evidence} onChange={(value) => patch({ evidence: value })} />
            </TabsContent>
          </div>
        </Tabs>

        <Separator />
        <SheetFooter className="flex-row items-center justify-between">
          {source ? (
            <Button variant="ghost" className="text-destructive" onClick={remove} disabled={pending}>
              <TrashIcon /> Delete
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={save} disabled={pending}>
              {pending ? "Saving…" : "Save"}
            </Button>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}

function FactPicker({ facts, selected, onChange }: { facts: DraftFact[]; selected: string[]; onChange: (keys: string[]) => void }) {
  const usable = facts.filter((fact) => fact.statement.trim())
  return (
    <Popover>
      <PopoverTrigger render={<Button size="xs" variant="outline" />}>
        <LinkIcon /> {selected.length ? `${selected.length} linked` : "Link facts"}
      </PopoverTrigger>
      <PopoverContent className="w-96 p-2" align="start">
        {usable.length ? (
          <ul className="grid max-h-72 gap-1 overflow-y-auto">
            {usable.map((fact) => {
              const checked = selected.includes(fact.key)
              return (
                <li key={fact.key}>
                  <label className="flex cursor-pointer items-start gap-2 rounded-md p-2 text-sm hover:bg-muted">
                    <Checkbox checked={checked} onCheckedChange={(value) => onChange(value ? [...selected, fact.key] : selected.filter((k) => k !== fact.key))} className="mt-0.5" />
                    <span>{fact.statement}</span>
                  </label>
                </li>
              )
            })}
          </ul>
        ) : (
          <p className="p-2 text-sm text-muted-foreground">Add facts first.</p>
        )}
      </PopoverContent>
    </Popover>
  )
}

function TextList({ id, label, hint, value, onChange }: { id: string; label: string; hint: string; value: string; onChange: (value: string) => void }) {
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Textarea id={id} rows={4} value={value} onChange={(event) => onChange(event.target.value)} />
      <p className="text-xs text-muted-foreground">{hint}</p>
    </div>
  )
}
