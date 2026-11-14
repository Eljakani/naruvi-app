"use client"

import { useTranslations } from "next-intl"
import type { EntryEnrichment } from "@/lib/enrichment"

/** Public facts from an online lookup, always shown with where they came from. */
export function EnrichmentFacts({ about }: { about: Pick<EntryEnrichment, "name" | "description" | "website" | "facts" | "sources"> }) {
  const t = useTranslations("enrichment")
  return (
    <div className="grid min-w-0 gap-1 text-sm">
      <p className="font-medium">
        {about.name}
        {about.description ? <span className="font-normal text-muted-foreground"> · {about.description}</span> : null}
      </p>
      {about.facts.length || about.website ? (
        <p className="text-muted-foreground">
          {[...about.facts.map((fact) => `${t(`facts.${fact.label}`)}: ${fact.value}`), about.website ? `${t("website")}: ${about.website.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "")}` : ""].filter(Boolean).join(" · ")}
        </p>
      ) : null}
      <p className="text-xs text-muted-foreground">
        {t("sources")}:{" "}
        {about.sources.map((source, index) => (
          <span key={source.url}>
            {index ? ", " : ""}
            <a href={source.url} target="_blank" rel="noreferrer" className="underline underline-offset-2">{source.name}</a>
          </span>
        ))}
      </p>
    </div>
  )
}
