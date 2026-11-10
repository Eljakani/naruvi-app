"use client"

import { useEffect, useId, useState, useTransition } from "react"
import { CalendarPlusIcon, CheckIcon, DownloadIcon, Loader2Icon } from "lucide-react"
import { toast } from "sonner"
import { downloadInterviewCalendarAction, getInterviewCalendarAction, saveInterviewCalendarAction } from "@/app/[locale]/(app)/applications/actions"
import { Button } from "@/components/ui/button"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { zonedInterviewStart } from "@/lib/interview-calendar"
import { useLocale, useTranslations } from "next-intl"

/** Availability is not a confirmed appointment: the user supplies and reviews the slot. */
export function InterviewCalendar({ applicationId, messageId }: { applicationId: string; messageId: string }) {
  const t = useTranslations("interviewCalendar")
  const locale = useLocale()
  const id = useId()
  const [open, setOpen] = useState(false)
  const [dismissed, setDismissed] = useState(false)
  const [saved, setSaved] = useState<Awaited<ReturnType<typeof getInterviewCalendarAction>>>(null)
  const [local, setLocal] = useState("")
  const [zone, setZone] = useState("")
  const [duration, setDuration] = useState("60")
  const [tentative, setTentative] = useState(true)
  const [location, setLocation] = useState("")
  const [error, setError] = useState("")
  const [pending, startSave] = useTransition()
  useEffect(() => {
    let current = true
    void getInterviewCalendarAction(applicationId, messageId).then((value) => { if (current) setSaved(value) }).catch(() => {})
    return () => { current = false }
  }, [applicationId, messageId])
  const download = (ics: string) => {
    const url = URL.createObjectURL(new Blob([ics], { type: "text/calendar;charset=utf-8" }))
    const link = document.createElement("a")
    link.href = url; link.download = "naruvi-interview.ics"; link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  const [ics, setIcs] = useState("")
  const save = () => startSave(async () => {
    setError("")
    try {
      const result = await saveInterviewCalendarAction({ applicationId, messageId, start: zonedInterviewStart(local, zone), duration: Number(duration), timeZone: zone, tentative, location })
      if (!result.ok) return setError(result.message)
      setSaved(result.event); setIcs(result.ics); setOpen(false)
      toast.success(result.event.tentative ? t("holdAdded") : t("added"), { description: t("addedBody") })
    } catch (problem) { setError(problem instanceof Error ? problem.message : t("saveFailed")) }
  })
  if (dismissed && !saved) return null
  return <section className="grid min-w-0 gap-3 rounded-lg border bg-muted/30 p-4" aria-label={t("label")}>
    <div className="flex flex-wrap items-start gap-3"><CalendarPlusIcon aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-muted-foreground" /><div className="grid min-w-0 flex-1 gap-1"><h3 className="text-sm font-medium">{saved ? saved.tentative ? t("hold") : t("onCalendar") : t("ask")}</h3><p className="text-xs leading-relaxed text-muted-foreground">{saved ? `${new Date(saved.start).toLocaleString(locale, { timeZone: saved.timeZone, dateStyle: "medium", timeStyle: "short" })} · ${saved.timeZone} · ${t("minutes", { count: saved.duration })}` : t("intro")}</p></div>{!open ? <Button size="sm" variant="outline" onClick={() => {
      if (saved) { const parts = new Intl.DateTimeFormat("sv-SE", { timeZone: saved.timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(saved.start)); setLocal(parts.replace(" ", "T")); setZone(saved.timeZone); setDuration(String(saved.duration)); setTentative(saved.tentative); setLocation(saved.location) }
      if (!saved && !zone) setZone(Intl.DateTimeFormat().resolvedOptions().timeZone)
      setOpen(true)
    }}>{saved ? t("edit") : t("addButton")}</Button> : null}</div>
    {saved && !open ? <div className="flex flex-wrap items-center gap-2 text-xs"><CheckIcon className="size-3.5" /><span>{t("saved")} {saved.tentative ? t("awaiting") : ""}</span>{ics ? <Button variant="ghost" size="sm" onClick={() => download(ics)}><DownloadIcon /> {t("download")}</Button> : <Button variant="ghost" size="sm" onClick={() => startSave(async () => { try { const result = await downloadInterviewCalendarAction(applicationId, messageId); if (result.ok) { setIcs(result.ics); download(result.ics) } else setError(result.message) } catch { setError(t("downloadFailed")) } })} disabled={pending}><DownloadIcon /> {t("download")}</Button>}</div> : null}
    {open ? <form onSubmit={(event) => { event.preventDefault(); save() }} className="grid gap-3 border-t pt-3"><fieldset disabled={pending} className="grid gap-3">
      <div className="grid gap-3 sm:grid-cols-2"><Field><FieldLabel htmlFor={`${id}-when`} className="text-xs">{t("when")}</FieldLabel><Input id={`${id}-when`} type="datetime-local" required value={local} onChange={(event) => setLocal(event.target.value)} /></Field><Field><FieldLabel htmlFor={`${id}-zone`} className="text-xs">{t("zone")}</FieldLabel><Input id={`${id}-zone`} required value={zone} onChange={(event) => setZone(event.target.value)} placeholder="Europe/Paris" /></Field></div>
      <div className="grid gap-3 sm:grid-cols-2"><Field><FieldLabel htmlFor={`${id}-duration`} className="text-xs">{t("duration")}</FieldLabel><Input id={`${id}-duration`} type="number" min={15} max={480} required value={duration} onChange={(event) => setDuration(event.target.value)} /></Field><Field><FieldLabel htmlFor={`${id}-status`} className="text-xs">{t("status")}</FieldLabel><select id={`${id}-status`} value={tentative ? "tentative" : "confirmed"} onChange={(event) => setTentative(event.target.value === "tentative")} className="h-9 rounded-md border bg-background px-2 text-sm focus-visible:outline-2 focus-visible:outline-ring"><option value="tentative">{t("tentative")}</option><option value="confirmed">{t("confirmed")}</option></select></Field></div>
      <Field><FieldLabel htmlFor={`${id}-location`} className="text-xs">{t("location")} <span className="font-normal text-muted-foreground">{t("optional")}</span></FieldLabel><Input id={`${id}-location`} maxLength={500} value={location} onChange={(event) => setLocation(event.target.value)} placeholder={t("locationPlaceholder")} /></Field>
      <p className="text-xs text-muted-foreground">{t("replaces")}</p>
      <div className="flex flex-wrap items-center gap-2"><Button size="sm" type="submit">{pending ? <Loader2Icon className="animate-spin" /> : <CalendarPlusIcon />} {t("save")}</Button><Button size="sm" variant="ghost" type="button" onClick={() => setOpen(false)}>{t("cancel")}</Button></div>
    </fieldset></form> : !saved ? <Button size="sm" variant="ghost" className="w-fit text-muted-foreground" onClick={() => setDismissed(true)}>{t("notNow")}</Button> : null}
    {error ? <p role="alert" className="text-xs text-destructive">{error}</p> : null}
  </section>
}
