"use client"

import { useEffect, useRef, useState } from "react"
import { loadPdfJs } from "@/components/documents/pdf-preview"
import { Skeleton } from "@/components/ui/skeleton"
import type { DesignTokens } from "@/lib/design"
import { cn } from "@/lib/utils"

const cache = new Map<string, Promise<ArrayBuffer>>()

/** First page of a design, rendered with the person's own CV. Cached per design. */
export function PdfThumb({ tokens, className }: { tokens: DesignTokens; className?: string }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const [ready, setReady] = useState(false)
  const key = JSON.stringify(tokens)
  useEffect(() => {
    let cancelled = false
    const bytes = cache.get(key) ?? fetch("/api/templates/preview", { method: "POST", headers: { "content-type": "application/json" }, body: key.length ? JSON.stringify({ tokens }) : "{}" }).then((response) => response.arrayBuffer())
    cache.set(key, bytes)
    ;(async () => {
      const [pdfjs, data] = await Promise.all([loadPdfJs(), bytes])
      const doc = await pdfjs.getDocument({ data: data.slice(0) }).promise
      const page = await doc.getPage(1)
      const target = canvas.current
      if (!target || cancelled) return
      const width = target.parentElement?.clientWidth ?? 240
      const viewport = page.getViewport({ scale: 1 })
      const scale = (width / viewport.width) * Math.min(2, window.devicePixelRatio || 1)
      const scaled = page.getViewport({ scale })
      target.width = scaled.width
      target.height = scaled.height
      await page.render({ canvas: target, viewport: scaled }).promise
      if (!cancelled) setReady(true)
    })().catch(() => {})
    return () => {
      cancelled = true
    }
  }, [key, tokens])
  return (
    <div className={cn("relative aspect-[210/297] overflow-hidden rounded-md bg-white ring-1 ring-border", className)}>
      {!ready ? <Skeleton className="absolute inset-0 rounded-none" /> : null}
      <canvas ref={canvas} className={cn("size-full transition-opacity duration-200", ready ? "opacity-100" : "opacity-0")} />
    </div>
  )
}
