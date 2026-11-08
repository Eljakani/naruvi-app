"use client"

import { useEffect, useRef, useState } from "react"
import { loadPdfJs } from "@/components/documents/pdf-preview"
import type { DesignTokens } from "@/lib/design"
import { cn } from "@/lib/utils"
import { fetchTemplatePreview } from "@/lib/template-preview"

const cache = new Map<string, ArrayBuffer>()
const CACHE_LIMIT = 24

/** Render only tiles near the viewport. A revision-aware cache stores successful PDFs. */
export function PdfThumb({ tokens, className, revision, retryable = false, kind = "cv" }: { tokens: DesignTokens; className?: string; revision?: string; retryable?: boolean; kind?: "cv" | "letter" }) {
  const wrapper = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const [visible, setVisible] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const [rendered, setRendered] = useState<{ key: string; ready: boolean }>()
  const body = JSON.stringify({ tokens, kind })
  const cacheKey = revision ? `${revision}:${body}` : undefined
  const renderKey = `${cacheKey ?? body}:${attempt}`
  const ready = rendered?.key === renderKey && rendered.ready
  const failed = rendered?.key === renderKey && !rendered.ready

  useEffect(() => {
    const element = wrapper.current
    if (!element) return
    const observer = new IntersectionObserver(([entry]) => {
      element.dataset.inView = String(entry.isIntersecting)
      if (entry.isIntersecting) setVisible(true)
    }, { rootMargin: "160px" })
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const target = canvas.current
    if (!visible || !target) return
    const controller = new AbortController()
    let cancelled = false
    let loading: ReturnType<Awaited<ReturnType<typeof loadPdfJs>>["getDocument"]> | undefined
    let task: ReturnType<import("pdfjs-dist/legacy/build/pdf.mjs").PDFPageProxy["render"]> | undefined
    async function render() {
      try {
        const pdfjs = await loadPdfJs()
        if (cancelled) return
        let data = cacheKey ? cache.get(cacheKey) : undefined
        if (!data) {
          data = (await fetchTemplatePreview(body, controller.signal)).data
        }
        if (cancelled) return
        loading = pdfjs.getDocument({ data: data.slice(0) })
        const doc = await loading.promise
        const page = await doc.getPage(1)
        if (cancelled || !target) return
        // A fixed raster size avoids intrinsic canvas dimensions changing the card layout.
        const view = page.getViewport({ scale: 480 / page.getViewport({ scale: 1 }).width })
        const scratch = document.createElement("canvas")
        scratch.width = Math.floor(view.width)
        scratch.height = Math.floor(view.height)
        task = page.render({ canvas: scratch, viewport: view })
        await task.promise
        if (cancelled) return
        target.width = scratch.width
        target.height = scratch.height
        target.getContext("2d")?.drawImage(scratch, 0, 0)
        if (cacheKey) {
          cache.delete(cacheKey)
          cache.set(cacheKey, data)
          if (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value!)
        }
        setRendered({ key: renderKey, ready: true })
      } catch {
        if (cancelled) return
        if (cacheKey) cache.delete(cacheKey)
        setRendered({ key: renderKey, ready: false })
      } finally {
        const finished = loading
        loading = undefined
        await finished?.destroy().catch(() => {})
      }
    }
    void render()
    return () => {
      cancelled = true
      controller.abort()
      task?.cancel()
      void loading?.destroy().catch(() => {})
      loading = undefined
    }
  }, [visible, body, cacheKey, renderKey])

  return (
    <div ref={wrapper} aria-busy={!ready && !failed} data-loading={!ready && !failed} className={cn("cb-pdf-thumb relative aspect-[210/297] w-full min-w-0 overflow-hidden rounded-md bg-white ring-1 ring-border", className)}>
      <div aria-hidden="true" className={cn("cb-pdf-placeholder pointer-events-none absolute inset-0 overflow-hidden bg-background p-[10%] transition-opacity duration-200 ease-(--ease-out)", ready || failed ? "opacity-0" : "opacity-100")}>
        <div className="mb-[12%] space-y-[4%]">
          <div className="h-3 w-3/5 rounded-sm bg-muted" />
          <div className="h-1.5 w-4/5 rounded-sm bg-muted/70" />
          <div className="h-1 w-2/5 rounded-sm bg-muted/60" />
        </div>
        {[0, 1, 2].map((section) => (
          <div key={section} className="mb-[10%] space-y-[4%]">
            <div className="mb-[6%] h-1.5 w-1/3 rounded-sm bg-muted" />
            <div className="h-1 w-full rounded-sm bg-muted/70" />
            <div className="h-1 w-[90%] rounded-sm bg-muted/70" />
            <div className="h-1 w-3/4 rounded-sm bg-muted/70" />
          </div>
        ))}
      </div>
      <canvas ref={canvas} aria-hidden="true" className={cn("absolute inset-0 size-full transition-opacity duration-200 ease-(--ease-out)", ready ? "opacity-100" : "opacity-0")} />
      {failed ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-muted p-2 text-center text-xs text-muted-foreground">
          <span>Preview unavailable</span>
          {retryable ? <button type="button" className="relative z-10 min-h-7 rounded px-2 font-medium text-foreground underline underline-offset-2" onClick={() => setAttempt((value) => value + 1)}>Retry preview</button> : null}
        </div>
      ) : null}
    </div>
  )
}
