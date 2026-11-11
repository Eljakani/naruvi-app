import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { useTranslations } from "next-intl"

type Stage = { id: "tracked" | "sent" | "interviewing" | "offer"; label: string; count: number }

const pct = (part: number, whole: number) => (whole ? Math.round((part / whole) * 100) : 0)

/** How far applications got: tracked → sent → interviews → offers, with the rate at each step. */
export function OutcomeFunnel({ stages }: { stages: Stage[] }) {
  const top = stages[0]?.count ?? 0
  const sent = stages.find((stage) => stage.id === "sent")?.count ?? 0
  const offers = stages.at(-1)?.count ?? 0
  const t = useTranslations("funnel")
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle><h2>{t("title")}</h2></CardTitle>
        <CardDescription>{sent ? t("rate", { percent: pct(offers, sent) }) : t("empty")}</CardDescription>
      </CardHeader>
      <CardContent>
        <ol className="grid gap-2.5">
          {stages.map((stage, index) => {
            const previous = index ? stages[index - 1] : null
            const rate = previous ? pct(stage.count, previous.count) : null
            const sentence = previous ? t("step", { count: stage.count, stage: t(`stages.${stage.id}`), rate: rate ?? 0, previous: previous.count, previousStage: t(`stages.${previous.id}`) }) : t("tracked", { count: stage.count })
            return (
              <li key={stage.id} title={sentence} className="grid grid-cols-[5.5rem_minmax(0,1fr)_auto] items-center gap-3 text-sm">
                <span aria-hidden className="text-muted-foreground">{t(`stages.${stage.id}`)}</span>
                <span aria-hidden className="h-5 overflow-hidden rounded bg-muted">
                  <span
                    className="block h-full origin-left rounded bg-brand transition-transform duration-700 ease-out starting:scale-x-0 motion-reduce:transition-none rtl:origin-right"
                    style={{ width: stage.count ? `max(4px, ${(stage.count / Math.max(top, 1)) * 100}%)` : 0 }}
                  />
                </span>
                <span className="flex min-w-16 items-baseline justify-end gap-2 tabular-nums">
                  <span aria-hidden className="font-medium">{stage.count}</span>
                  <span aria-hidden className="w-9 text-end text-xs text-muted-foreground">{rate === null ? "" : `${rate}%`}</span>
                  <span className="sr-only">{sentence}</span>
                </span>
              </li>
            )
          })}
        </ol>
      </CardContent>
    </Card>
  )
}
