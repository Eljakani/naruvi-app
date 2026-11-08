let active = 0
const waiting: (() => void)[] = []

async function acquire(signal: AbortSignal) {
  signal.throwIfAborted()
  if (active < 2) {
    active += 1
    return
  }
  await new Promise<void>((resolve, reject) => {
    const start = () => {
      signal.removeEventListener("abort", abort)
      resolve()
    }
    const abort = () => {
      waiting.splice(waiting.indexOf(start), 1)
      reject(signal.reason)
    }
    waiting.push(start)
    signal.addEventListener("abort", abort, { once: true })
  })
}

function pause(ms: number, signal: AbortSignal) {
  signal.throwIfAborted()
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", abort)
      resolve()
    }, ms)
    const abort = () => {
      clearTimeout(timer)
      reject(signal.reason)
    }
    signal.addEventListener("abort", abort, { once: true })
  })
}

/** Match the server's two-render budget, including editor and gallery requests. */
export async function fetchTemplatePreview(body: string, signal: AbortSignal) {
  await acquire(signal)
  try {
    for (let attempt = 0; ; attempt += 1) {
      signal.throwIfAborted()
      // Queue and rate-limit waits must not consume the network timeout.
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 30_000)
      let retryMs: number
      try {
        const response = await fetch("/api/templates/preview", {
          method: "POST", headers: { "content-type": "application/json" }, body,
          signal: AbortSignal.any([signal, controller.signal]),
        })
        if (response.status !== 429 || attempt >= 2) {
          if (!response.ok || !response.headers.get("content-type")?.startsWith("application/pdf")) throw new Error(`Preview request failed (${response.status})`)
          return { data: await response.arrayBuffer(), pages: Number(response.headers.get("x-pages")) }
        }
        const retry = response.headers.get("retry-after")
        const seconds = retry === null ? NaN : Number(retry)
        const delay = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(retry ?? "") - Date.now()
        retryMs = Number.isFinite(delay) ? Math.max(1000, delay) : 5000
        await response.body?.cancel()
      } finally {
        clearTimeout(timeout)
      }
      await pause(retryMs, signal)
    }
  } finally {
    const next = waiting.shift()
    if (next) next()
    else active -= 1
  }
}
