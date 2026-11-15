"use client"

import { useId, useState } from "react"
import { Segmented } from "@/components/ui/segmented"
import { Textarea } from "@/components/ui/textarea"
import type { CvBrief } from "@/server/documents/model"
import { useTranslations } from "next-intl"

/**
 * What to ask for before a CV is written: length, how much detail, and what
 * to stress. Lives inside the generate form and submits with it.
 */
export function BriefFields({ brief }: { brief?: CvBrief }) {
  const t = useTranslations("cvBrief")
  const id = useId()
  const [pages, setPages] = useState<CvBrief["pages"]>(brief?.pages ?? "auto")
  const [tone, setTone] = useState<CvBrief["tone"]>(brief?.tone ?? "balanced")
  return (
    <div className="grid gap-3">
      <input type="hidden" name="pages" value={pages} />
      <input type="hidden" name="tone" value={tone} />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-medium">{t("pages")}</span>
        <Segmented label={t("pages")} value={pages} onChange={setPages} options={[{ value: "auto", label: t("pagesAuto") }, { value: "1", label: t("pagesOne") }, { value: "2", label: t("pagesTwo") }]} />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-medium">{t("tone")}</span>
        <Segmented label={t("tone")} value={tone} onChange={setTone} options={[{ value: "concise", label: t("concise") }, { value: "balanced", label: t("balanced") }, { value: "detailed", label: t("detailed") }]} />
      </div>
      <div className="grid gap-1.5">
        <label htmlFor={`${id}-focus`} className="text-xs font-medium">{t("focus")}</label>
        <Textarea id={`${id}-focus`} name="focus" defaultValue={brief?.focus ?? ""} maxLength={300} rows={2} placeholder={t("focusPlaceholder")} className="text-[13px]" />
        <p className="text-xs text-muted-foreground">{t("focusHint")}</p>
      </div>
    </div>
  )
}
