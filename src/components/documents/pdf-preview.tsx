"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { ExternalLinkIcon, Loader2Icon, MaximizeIcon, MinusIcon, PlusIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

type PdfJs = typeof import("pdfjs-dist")
let pdfjsPromise: Promise<PdfJs> | null = null

/** Load pdf.js once, in the browser only, with its worker. */
export function loadPdfJs() {
  pdfjsPromise ??= import("pdfjs-dist").then((pdfjs) => {
    pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString()
    return pdfjs
  }).catch((error) => {
    pdfjsPromise = null
    throw error
  })
  return pdfjsPromise
}

const ZOOMS = [0.5, 0.65, 0.8, 1, 1.25, 1.5]

/**
 * In-app PDF reader: white pages on a soft desk, same look in every browser.
 * Renders each page to a canvas at device pixel ratio for crisp text.
 */
export function PdfPreview({ url, pageBudget, className, busy = false, onRetry }: { url: string; pageBudget?: number; className?: string; busy?: boolean; onRetry?: () => void }) {
  const viewport = useRef<HTMLDivElement>(null)
  const pagesRef = useRef<HTMLDivElement>(null)
  const [pageCount, setPageCount] = useState(0)
  const [current, setCurrent] = useState(1)
  const [zoom, setZoom] = useState<number | "fit">("fit")
  const [width, setWidth] = useState(0)
  const [state, setState] = useState<"loading" | "ready" | "error">("loading")

  // Track the available width for "fit".
  useEffect(() => {
    const element = viewport.current
    if (!element) return
    const observer = new ResizeObserver(([entry]) => setWidth(Math.floor(entry.contentRect.width)))
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (!width || !pagesRef.current) return
    let cancelled = false
    let loading: ReturnType<PdfJs["getDocument"]> | undefined
    let task: ReturnType<import("pdfjs-dist").PDFPageProxy["render"]> | undefined
    const container = pagesRef.current
    ;(async () => {
      try {
        setState((value) => (value === "ready" ? value : "loading"))
        const pdfjs = await loadPdfJs()
        if (cancelled) return
        loading = pdfjs.getDocument({ url })
        const pdf = await loading.promise
        if (cancelled) return
        const canvases: HTMLCanvasElement[] = []
        for (let index = 1; index <= pdf.numPages; index += 1) {
          const page = await pdf.getPage(index)
          if (cancelled) return
          const base = page.getViewport({ scale: 1 })
          const target = zoom === "fit" ? Math.min(width - 48, 900) : base.width * zoom * (96 / 72)
          const scale = target / base.width
          const ratio = window.devicePixelRatio || 1
          const view = page.getViewport({ scale: scale * ratio })
          const canvas = document.createElement("canvas")
          canvas.width = Math.floor(view.width)
          canvas.height = Math.floor(view.height)
          canvas.style.width = `${Math.floor(view.width / ratio)}px`
          canvas.style.height = `${Math.floor(view.height / ratio)}px`
          canvas.className = "block rounded-sm bg-white shadow-[0_1px_2px_rgba(0,0,0,.06),0_8px_24px_-6px_rgba(0,0,0,.18)]"
          canvas.dataset.page = String(index)
          canvas.setAttribute("role", "img")
          canvas.setAttribute("aria-label", `Page ${index} of ${pdf.numPages}`)
          task = page.render({ canvas, canvasContext: canvas.getContext("2d")!, viewport: view })
          await task.promise
          if (cancelled) return
          canvases.push(canvas)
        }
        container.replaceChildren(...canvases)
        setPageCount(pdf.numPages)
        setCurrent((page) => Math.min(page, pdf.numPages))
        setState("ready")
      } catch {
        if (!cancelled) setState("error")
      } finally {
        const finished = loading
        loading = undefined
        await finished?.destroy().catch(() => {})
      }
    })()
    return () => {
      cancelled = true
      task?.cancel()
      void loading?.destroy().catch(() => {})
      loading = undefined
    }
  }, [url, width, zoom])

  // Current page from scroll position.
  const onScroll = useCallback(() => {
    const element = viewport.current
    if (!element) return
    const pages = [...element.querySelectorAll<HTMLCanvasElement>("canvas[data-page]")]
    const middle = element.scrollTop + element.clientHeight / 3
    const visible = pages.findLast((page) => page.offsetTop <= middle)
    if (visible) setCurrent(Number(visible.dataset.page))
  }, [])

  const step = (direction: 1 | -1) => {
    const now = zoom === "fit" ? 0.8 : zoom
    const index = ZOOMS.findIndex((value) => value >= now)
    const next = ZOOMS[Math.max(0, Math.min(ZOOMS.length - 1, (index < 0 ? ZOOMS.length - 1 : index) + direction))]
    setZoom(next)
  }

  const over = pageBudget !== undefined && pageCount > pageBudget

  return (
    <div className={cn("flex min-h-0 flex-col overflow-hidden rounded-xl border bg-muted/50", className)}>
      <div className="flex flex-wrap items-center gap-1 border-b bg-background px-2 py-1.5">
        <span className={cn("rounded-md px-2 py-0.5 text-xs tabular-nums", over ? "bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-400" : "text-muted-foreground")}>
          {pageCount ? `Page ${current} of ${pageCount}` : "—"}
          {pageBudget !== undefined && pageCount ? ` · budget ${pageBudget}` : ""}
        </span>
        <div className="ml-auto flex items-center gap-0.5">
          <Tooltip>
            <TooltipTrigger render={<Button size="icon-sm" variant="ghost" aria-label="Zoom out" onClick={() => step(-1)} />}>
              <MinusIcon />
            </TooltipTrigger>
            <TooltipContent>Zoom out</TooltipContent>
          </Tooltip>
          <button type="button" onClick={() => setZoom("fit")} className={cn("min-w-14 rounded-md px-2 py-1 text-xs tabular-nums hover:bg-muted", zoom === "fit" && "font-medium")}>
            {zoom === "fit" ? "Fit" : `${Math.round(zoom * 100)}%`}
          </button>
          <Tooltip>
            <TooltipTrigger render={<Button size="icon-sm" variant="ghost" aria-label="Zoom in" onClick={() => step(1)} />}>
              <PlusIcon />
            </TooltipTrigger>
            <TooltipContent>Zoom in</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger render={<Button size="icon-sm" variant="ghost" aria-label="Fit width" onClick={() => setZoom("fit")} />}>
              <MaximizeIcon />
            </TooltipTrigger>
            <TooltipContent>Fit width</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger render={<Button size="icon-sm" variant="ghost" aria-label="Open in new tab" nativeButton={false} render={<a href={url} target="_blank" rel="noreferrer" />} />}>
              <ExternalLinkIcon />
            </TooltipTrigger>
            <TooltipContent>Open the PDF in a new tab</TooltipContent>
          </Tooltip>
        </div>
      </div>
      <div ref={viewport} onScroll={onScroll} className="relative min-h-0 flex-1 overflow-auto">
        {state === "loading" ? (
          <div className="cb-fade absolute inset-0 z-10 grid place-items-center bg-muted/40">
            <Loader2Icon className="size-5 animate-spin text-muted-foreground" />
          </div>
        ) : null}
        {state === "error" ? <div role="status" className="grid justify-items-center gap-2 p-6 text-center text-sm text-muted-foreground">
          <p>Couldn’t display this PDF. {onRetry ? "Retry or open it in a new tab." : "Use ‘Open in new tab’."}</p>
          {onRetry ? <Button size="sm" variant="outline" onClick={onRetry}>Retry preview</Button> : null}
        </div> : null}
        <div
          ref={pagesRef}
          aria-busy={busy || state === "loading"}
          className={cn(
            "flex flex-col items-center gap-6 px-6 py-6 transition-[opacity,filter,transform] duration-300 ease-(--ease-out)",
            state !== "ready" && "translate-y-1 opacity-0",
            busy && "opacity-60 blur-[1.5px]",
          )}
        />
      </div>
    </div>
  )
}
