"use client"

import { useState, useTransition } from "react"
import { CompassIcon, PencilIcon, PlusIcon, TrashIcon } from "lucide-react"
import { toast } from "sonner"
import { saveGoalsAction } from "@/app/(app)/profile/actions"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { COUNTRIES } from "@/lib/geo"
import { CONTRACT_LABEL } from "@/lib/job-labels"
import { monthLabel, WORK_MODES, type SearchGoal } from "@/lib/search-goals"

const PRESSED = "aria-pressed:border-foreground aria-pressed:bg-foreground aria-pressed:text-background"
const blank = (): SearchGoal => ({ id: crypto.randomUUID().slice(0, 8), name: "", active: true, contracts: [], places: [], workModes: [], authorizedIn: [], minMonths: null, maxMonths: null, startFrom: null })

function summary(goal: SearchGoal) {
  const months = goal.minMonths || goal.maxMonths ? `${goal.minMonths ?? "?"}–${goal.maxMonths ?? "?"} months` : ""
  return [
    goal.contracts.map((key) => CONTRACT_LABEL[key] ?? key).join(" / ") || "Any contract",
    goal.places.join(", ") || "Anywhere",
    goal.workModes.map((mode) => WORK_MODES[mode]).join(" / "),
    months,
    goal.startFrom ? `From ${monthLabel(goal.startFrom)}` : "",
    goal.authorizedIn.length ? `Can work in ${goal.authorizedIn.map((code) => COUNTRIES[code]?.name ?? code).join(", ")}` : "",
  ].filter(Boolean)
}

/** What the person is looking for. Every fit check is measured against these before skills. */
export function SearchGoals({ goals, location }: { goals: SearchGoal[]; location: string }) {
  const [editing, setEditing] = useState<SearchGoal | null>(null)
  const [pending, startTransition] = useTransition()
  const save = (next: SearchGoal[], done?: () => void) =>
    startTransition(async () => {
      const result = await saveGoalsAction(next)
      if (!result.ok) return void toast.error("Could not save", { description: result.error })
      toast.success("Search goals saved")
      done?.()
    })

  return (
    <Card className="gap-4">
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div className="grid gap-1">
          <CardTitle className="flex items-center gap-2 text-base"><CompassIcon className="size-4" /> What you’re looking for</CardTitle>
          <CardDescription>Every job is checked against these before your skills: contract, place, work mode, and where you can legally work.</CardDescription>
        </div>
        <Button size="sm" variant="outline" onClick={() => setEditing(blank())} disabled={goals.length >= 8}>
          <PlusIcon /> Add goal
        </Button>
      </CardHeader>
      <CardContent className="grid gap-2">
        {goals.length ? goals.map((goal) => (
          <div key={goal.id} className="flex flex-wrap items-center gap-3 rounded-lg border px-3 py-2.5">
            <div className="grid min-w-0 flex-1 gap-1.5">
              <p className="flex items-center gap-2 text-sm font-medium">{goal.name}{goal.active ? null : <Badge variant="outline">Paused</Badge>}</p>
              <div className="flex flex-wrap gap-1.5">
                {summary(goal).map((item) => <Badge key={item} variant="secondary" className="font-normal">{item}</Badge>)}
              </div>
            </div>
            <Switch checked={goal.active} disabled={pending} onCheckedChange={(active) => save(goals.map((item) => (item.id === goal.id ? { ...item, active } : item)))} aria-label={`${goal.active ? "Pause" : "Resume"} ${goal.name}`} />
            <Button size="icon-sm" variant="ghost" onClick={() => setEditing(goal)} aria-label={`Edit ${goal.name}`}><PencilIcon /></Button>
          </div>
        )) : (
          <p className="text-sm text-muted-foreground">
            No goals yet{location ? `, so jobs are only checked against your location (${location})` : ""}. Add one, like “PFE internship in Paris, 6 months” or “CDI in France”, and each fit check will tell you when a job doesn’t fit it.
          </p>
        )}
      </CardContent>
      {editing ? (
        <GoalDialog
          key={editing.id}
          goal={editing}
          isNew={!goals.some((goal) => goal.id === editing.id)}
          pending={pending}
          onClose={() => setEditing(null)}
          onSave={(goal) => save(goals.some((item) => item.id === goal.id) ? goals.map((item) => (item.id === goal.id ? goal : item)) : [...goals, goal], () => setEditing(null))}
          onDelete={() => save(goals.filter((item) => item.id !== editing.id), () => setEditing(null))}
        />
      ) : null}
    </Card>
  )
}

function GoalDialog({ goal, isNew, pending, onClose, onSave, onDelete }: { goal: SearchGoal; isNew: boolean; pending: boolean; onClose: () => void; onSave: (goal: SearchGoal) => void; onDelete: () => void }) {
  const [draft, setDraft] = useState(goal)
  const [places, setPlaces] = useState(goal.places.join(", "))
  const patch = (next: Partial<SearchGoal>) => setDraft((current) => ({ ...current, ...next }))
  const months = (value: string) => (value.trim() ? Math.max(1, Math.min(60, Math.round(Number(value)) || 1)) : null)
  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    onSave({ ...draft, name: draft.name.trim() || "My search", places: places.split(/[,;\n]/).map((place) => place.trim()).filter(Boolean) })
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="flex max-h-[calc(100dvh-2rem)] flex-col sm:max-w-xl">
        <form onSubmit={submit} className="contents">
          <DialogHeader>
            <DialogTitle>{isNew ? "New search goal" : "Edit search goal"}</DialogTitle>
            <DialogDescription>Leave a section empty if anything goes.</DialogDescription>
          </DialogHeader>
          <div className="-mx-4 grid min-h-0 flex-1 content-start gap-5 overflow-y-auto overscroll-contain px-4 pb-1">
            <div className="grid gap-2">
              <Label htmlFor="goal-name">Name</Label>
              <Input id="goal-name" value={draft.name} onChange={(event) => patch({ name: event.target.value })} placeholder="PFE internship, Paris" maxLength={60} autoFocus />
            </div>
            <fieldset className="grid gap-2">
              <legend className="mb-2 text-sm font-medium">Contract</legend>
              <ToggleGroup multiple value={draft.contracts} onValueChange={(value) => patch({ contracts: value as SearchGoal["contracts"] })} variant="outline" size="sm" spacing={2} className="flex flex-wrap justify-start">
                {Object.entries(CONTRACT_LABEL).map(([key, label]) => <ToggleGroupItem key={key} value={key} className={PRESSED}>{label}</ToggleGroupItem>)}
              </ToggleGroup>
            </fieldset>
            <div className="grid gap-2">
              <Label htmlFor="goal-places">Places</Label>
              <Input id="goal-places" value={places} onChange={(event) => setPlaces(event.target.value)} placeholder="Paris, Lyon, or a country like France" />
              <p className="text-xs text-muted-foreground">Cities or countries, separated by commas. “Paris” also covers La Défense and the rest of Île-de-France.</p>
            </div>
            <fieldset className="grid gap-2">
              <legend className="mb-2 text-sm font-medium">Work mode</legend>
              <ToggleGroup multiple value={draft.workModes} onValueChange={(value) => patch({ workModes: value as SearchGoal["workModes"] })} variant="outline" size="sm" spacing={2} className="flex flex-wrap justify-start">
                {Object.entries(WORK_MODES).map(([key, label]) => <ToggleGroupItem key={key} value={key} className={PRESSED}>{label}</ToggleGroupItem>)}
              </ToggleGroup>
            </fieldset>
            <fieldset className="grid gap-2">
              <legend className="mb-1 text-sm font-medium">You can work without a visa in</legend>
              <p className="mb-1 text-xs text-muted-foreground">Jobs in other countries get flagged unless they offer sponsorship.</p>
              <ToggleGroup multiple value={draft.authorizedIn} onValueChange={(value) => patch({ authorizedIn: value })} variant="outline" size="sm" spacing={2} className="flex flex-wrap justify-start">
                {Object.entries(COUNTRIES).map(([code, country]) => <ToggleGroupItem key={code} value={code} className={PRESSED}>{country.name}</ToggleGroupItem>)}
              </ToggleGroup>
            </fieldset>
            <fieldset className="grid gap-2">
              <legend className="mb-1 text-sm font-medium">Timing</legend>
              <p className="mb-1 text-xs text-muted-foreground">When you can start, and how long, in months, for internships, alternance and fixed-term jobs (e.g. 5 to 6 for a PFE).</p>
              <div className="flex flex-wrap items-center gap-2">
                <Label htmlFor="goal-start" className="font-normal text-muted-foreground">Available from</Label>
                <Input id="goal-start" type="month" value={draft.startFrom ?? ""} onChange={(event) => patch({ startFrom: event.target.value || null })} className="w-40" />
              </div>
              <div className="flex items-center gap-2">
                <Input type="number" min={1} max={60} inputMode="numeric" aria-label="Minimum months" value={draft.minMonths ?? ""} onChange={(event) => patch({ minMonths: months(event.target.value) })} placeholder="Min" className="w-24" />
                <span className="text-sm text-muted-foreground">to</span>
                <Input type="number" min={1} max={60} inputMode="numeric" aria-label="Maximum months" value={draft.maxMonths ?? ""} onChange={(event) => patch({ maxMonths: months(event.target.value) })} placeholder="Max" className="w-24" />
              </div>
            </fieldset>
          </div>
          <DialogFooter className="sm:justify-between">
            {isNew ? <span /> : <Button type="button" variant="ghost" className="text-destructive" onClick={onDelete} disabled={pending}><TrashIcon /> Delete</Button>}
            <div className="flex gap-2">
              <DialogClose render={<Button type="button" variant="outline" />}>Cancel</DialogClose>
              <Button type="submit" disabled={pending}>Save goal</Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
