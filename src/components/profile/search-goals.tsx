"use client"

import { useState, useTransition } from "react"
import { CompassIcon, PencilIcon, PlusIcon, TrashIcon } from "lucide-react"
import { toast } from "sonner"
import { saveGoalsAction } from "@/app/[locale]/(app)/profile/actions"
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
import { WORK_MODES, type SearchGoal } from "@/lib/search-goals"
import { useLocale, useTranslations } from "next-intl"

const PRESSED = "aria-pressed:border-foreground aria-pressed:bg-foreground aria-pressed:text-background"
const blank = (): SearchGoal => ({ id: crypto.randomUUID().slice(0, 8), name: "", active: true, roles: [], contracts: [], places: [], workModes: [], authorizedIn: [], minMonths: null, maxMonths: null, startFrom: null })

type Words = { t: ReturnType<typeof useTranslations<"searchGoals">>; tl: ReturnType<typeof useTranslations<"labels">>; locale: string }
const countryName = (code: string, locale: string) => new Intl.DisplayNames([locale], { type: "region" }).of(code.toUpperCase()) ?? COUNTRIES[code]?.name ?? code
function summary(goal: SearchGoal, { t, tl, locale }: Words) {
  const months = goal.minMonths && goal.maxMonths ? t("months", { min: goal.minMonths, max: goal.maxMonths }) : goal.minMonths ? t("monthsMin", { min: goal.minMonths }) : goal.maxMonths ? t("monthsMax", { max: goal.maxMonths }) : ""
  const month = (value: string) => new Date(`${value}-01T12:00:00Z`).toLocaleDateString(locale, { month: "long", year: "numeric", timeZone: "UTC" })
  return [
    goal.roles.join(", "),
    goal.contracts.map((key) => tl(`contract.${key}`)).join(" / ") || t("anyContract"),
    goal.places.join(", ") || t("anywhere"),
    goal.workModes.map((mode) => tl(`workMode.${mode}`)).join(" / "),
    months,
    goal.startFrom ? t("from", { month: month(goal.startFrom) }) : "",
    goal.authorizedIn.length ? t("canWorkIn", { countries: goal.authorizedIn.map((code) => countryName(code, locale)).join(", ") }) : "",
  ].filter(Boolean)
}

/** What the person is looking for. Every fit check is measured against these before skills. */
export function SearchGoals({ goals, location }: { goals: SearchGoal[]; location: string }) {
  const t = useTranslations("searchGoals")
  const tl = useTranslations("labels")
  const locale = useLocale()
  const [editing, setEditing] = useState<SearchGoal | null>(null)
  const [pending, startTransition] = useTransition()
  const save = (next: SearchGoal[], done?: () => void) =>
    startTransition(async () => {
      const result = await saveGoalsAction(next)
      if (!result.ok) return void toast.error(t("saveFailed"), { description: result.error })
      toast.success(t("saved"))
      done?.()
    })

  return (
    <Card id="search-goals" className="scroll-mt-6 gap-4">
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div className="grid gap-1">
          <CardTitle className="flex items-center gap-2 text-base"><CompassIcon className="size-4" /> {t("title")}</CardTitle>
          <CardDescription>{t("description")}</CardDescription>
        </div>
        <Button size="sm" variant="outline" onClick={() => setEditing(blank())} disabled={goals.length >= 8}>
          <PlusIcon /> {t("add")}
        </Button>
      </CardHeader>
      <CardContent className="grid gap-2">
        {goals.length ? goals.map((goal) => (
          <div key={goal.id} className="flex flex-wrap items-center gap-3 rounded-lg border px-3 py-2.5">
            <div className="grid min-w-0 flex-1 gap-1.5">
              <p className="flex items-center gap-2 text-sm font-medium">{goal.name}{goal.active ? null : <Badge variant="outline">{t("paused")}</Badge>}</p>
              <div className="flex flex-wrap gap-1.5">
                {summary(goal, { t, tl, locale }).map((item) => <Badge key={item} variant="secondary" className="font-normal">{item}</Badge>)}
              </div>
            </div>
            <Switch checked={goal.active} disabled={pending} onCheckedChange={(active) => save(goals.map((item) => (item.id === goal.id ? { ...item, active } : item)))} aria-label={goal.active ? t("pause", { name: goal.name }) : t("resume", { name: goal.name })} />
            <Button size="icon-sm" variant="ghost" onClick={() => setEditing(goal)} aria-label={t("edit", { name: goal.name })}><PencilIcon /></Button>
          </div>
        )) : (
          <p className="text-sm text-muted-foreground">
            {location ? t("emptyLocation", { location }) : t("empty")}
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
  const t = useTranslations("searchGoals")
  const tl = useTranslations("labels")
  const locale = useLocale()
  const [draft, setDraft] = useState(goal)
  const [places, setPlaces] = useState(goal.places.join(", "))
  const [roles, setRoles] = useState(goal.roles.join(", "))
  const patch = (next: Partial<SearchGoal>) => setDraft((current) => ({ ...current, ...next }))
  const months = (value: string) => (value.trim() ? Math.max(1, Math.min(60, Math.round(Number(value)) || 1)) : null)
  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    onSave({ ...draft, name: draft.name.trim() || t("defaultName"), places: places.split(/[,;\n]/).map((place) => place.trim()).filter(Boolean), roles: [...new Set(roles.split(/[,;\n]/).map((role) => role.trim()).filter(Boolean))].slice(0, 3) })
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="flex max-h-[calc(100dvh-2rem)] flex-col sm:max-w-xl">
        <form onSubmit={submit} className="contents">
          <DialogHeader>
            <DialogTitle>{isNew ? t("dialog.new") : t("dialog.edit")}</DialogTitle>
            <DialogDescription>{t("dialog.description")}</DialogDescription>
          </DialogHeader>
          <div className="-mx-4 grid min-h-0 flex-1 content-start gap-5 overflow-y-auto overscroll-contain px-4 pb-1">
            <div className="grid gap-2">
              <Label htmlFor="goal-name">{t("dialog.name")}</Label>
              <Input id="goal-name" value={draft.name} onChange={(event) => patch({ name: event.target.value })} placeholder={t("dialog.namePlaceholder")} maxLength={60} autoFocus />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="goal-roles">{t("dialog.roles")}</Label>
              <Input id="goal-roles" value={roles} onChange={(event) => setRoles(event.target.value)} placeholder={t("dialog.rolesPlaceholder")} />
              <p className="text-xs text-muted-foreground">{t("dialog.rolesHint")}</p>
            </div>
            <fieldset className="grid gap-2">
              <legend className="mb-2 text-sm font-medium">{t("dialog.contract")}</legend>
              <ToggleGroup multiple value={draft.contracts} onValueChange={(value) => patch({ contracts: value as SearchGoal["contracts"] })} variant="outline" size="sm" spacing={2} className="flex flex-wrap justify-start">
                {Object.keys(CONTRACT_LABEL).map((key) => <ToggleGroupItem key={key} value={key} className={PRESSED}>{tl(`contract.${key as "permanent"}`)}</ToggleGroupItem>)}
              </ToggleGroup>
            </fieldset>
            <div className="grid gap-2">
              <Label htmlFor="goal-places">{t("dialog.places")}</Label>
              <Input id="goal-places" value={places} onChange={(event) => setPlaces(event.target.value)} placeholder={t("dialog.placesPlaceholder")} />
              <p className="text-xs text-muted-foreground">{t("dialog.placesHint")}</p>
            </div>
            <fieldset className="grid gap-2">
              <legend className="mb-2 text-sm font-medium">{t("dialog.workMode")}</legend>
              <ToggleGroup multiple value={draft.workModes} onValueChange={(value) => patch({ workModes: value as SearchGoal["workModes"] })} variant="outline" size="sm" spacing={2} className="flex flex-wrap justify-start">
                {Object.keys(WORK_MODES).map((key) => <ToggleGroupItem key={key} value={key} className={PRESSED}>{tl(`workMode.${key as "remote"}`)}</ToggleGroupItem>)}
              </ToggleGroup>
            </fieldset>
            <fieldset className="grid gap-2">
              <legend className="mb-1 text-sm font-medium">{t("dialog.visa")}</legend>
              <p className="mb-1 text-xs text-muted-foreground">{t("dialog.visaHint")}</p>
              <ToggleGroup multiple value={draft.authorizedIn} onValueChange={(value) => patch({ authorizedIn: value })} variant="outline" size="sm" spacing={2} className="flex flex-wrap justify-start">
                {Object.keys(COUNTRIES).map((code) => <ToggleGroupItem key={code} value={code} className={PRESSED}>{countryName(code, locale)}</ToggleGroupItem>)}
              </ToggleGroup>
            </fieldset>
            <fieldset className="grid gap-2">
              <legend className="mb-1 text-sm font-medium">{t("dialog.timing")}</legend>
              <p className="mb-1 text-xs text-muted-foreground">{t("dialog.timingHint")}</p>
              <div className="flex flex-wrap items-center gap-2">
                <Label htmlFor="goal-start" className="font-normal text-muted-foreground">{t("dialog.availableFrom")}</Label>
                <Input id="goal-start" type="month" value={draft.startFrom ?? ""} onChange={(event) => patch({ startFrom: event.target.value || null })} className="w-40" />
              </div>
              <div className="flex items-center gap-2">
                <Input type="number" min={1} max={60} inputMode="numeric" aria-label={t("dialog.minMonths")} value={draft.minMonths ?? ""} onChange={(event) => patch({ minMonths: months(event.target.value) })} placeholder={t("dialog.min")} className="w-24" />
                <span className="text-sm text-muted-foreground">{t("dialog.to")}</span>
                <Input type="number" min={1} max={60} inputMode="numeric" aria-label={t("dialog.maxMonths")} value={draft.maxMonths ?? ""} onChange={(event) => patch({ maxMonths: months(event.target.value) })} placeholder={t("dialog.max")} className="w-24" />
              </div>
            </fieldset>
          </div>
          <DialogFooter className="sm:justify-between">
            {isNew ? <span /> : <Button type="button" variant="ghost" className="text-destructive" onClick={onDelete} disabled={pending}><TrashIcon /> {t("dialog.delete")}</Button>}
            <div className="flex gap-2">
              <DialogClose render={<Button type="button" variant="outline" />}>{t("dialog.cancel")}</DialogClose>
              <Button type="submit" disabled={pending}>{t("dialog.save")}</Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
