import { cn } from "@/lib/utils"
import { useTranslations } from "next-intl"

/** Small circular fit score (0–100). Neutral colors; the arc length carries the value. */
export function FitRing({ score, size = 32, className }: { score: number | null | undefined; size?: number; className?: string }) {
  const t = useTranslations("application")
  if (score === null || score === undefined) return <span className={cn("text-muted-foreground", className)}>—</span>
  const value = Math.max(0, Math.min(100, Math.round(score)))
  const stroke = size >= 32 ? 3 : 2.5
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  return (
    <span role="img" aria-label={t("label", { value })} className={cn("relative inline-grid shrink-0 place-items-center", className)} style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} className="stroke-muted" />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - value / 100)} className="stroke-primary" />
      </svg>
      <span className="absolute text-[11px] font-semibold tabular-nums">{value}</span>
    </span>
  )
}
