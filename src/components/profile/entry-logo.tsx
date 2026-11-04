import { cn } from "@/lib/utils"

/** Entry logo on a neutral tile, or a monogram when there is none. */
export function EntryLogo({ path, name, size = 40, className }: { path: string | null | undefined; name: string; size?: number; className?: string }) {
  const initials =
    name
      .replace(/[^\p{L}\p{N}\s&]/gu, " ")
      .split(/\s+/)
      .filter((word) => word && !/^(&|and|de|of|the)$/i.test(word))
      .slice(0, 2)
      .map((word) => word[0]!.toUpperCase())
      .join("") || "?"
  return (
    <span
      className={cn("inline-flex shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-white", !path && "bg-muted", className)}
      style={{ width: size, height: size }}
      aria-hidden={!path}
    >
      {path ? (
        // eslint-disable-next-line @next/next/no-img-element -- local, content-addressed asset
        <img src={`/api/assets/${path}`} alt={`${name} logo`} className="size-full object-contain p-[12%]" />
      ) : (
        <span className="font-semibold text-muted-foreground" style={{ fontSize: Math.max(10, size * 0.32) }}>
          {initials}
        </span>
      )}
    </span>
  )
}
