// Talks to your own Naruvi. The address and API key stay in this browser (storage.local).
export const ext = globalThis.browser ?? globalThis.chrome

/** The address of the Naruvi this copy was downloaded from (naruvi.json, added by Naruvi's download), if any. */
export async function bundledServer() {
  try {
    const response = await fetch(ext.runtime.getURL("naruvi.json"))
    const { server } = await response.json()
    return typeof server === "string" && /^https?:\/\//.test(server) ? server.replace(/\/+$/, "") : ""
  } catch {
    return ""
  }
}

export async function settings() {
  const stored = await ext.storage.local.get(["server", "key", "badge"])
  const server = stored.server || (await bundledServer()) || "http://localhost:3000"
  return { server: server.replace(/\/+$/, ""), key: stored.key ?? "", badge: stored.badge ?? false }
}

export class NaruviError extends Error {
  constructor(message, { status = 0, offline = false } = {}) {
    super(message)
    this.status = status
    this.offline = offline
  }
}

/** JSON request with the API key; turns network and API errors into readable messages. */
export async function call(path, { method = "GET", body, timeout = 90_000 } = {}) {
  const { server, key } = await settings()
  if (!key) throw new NaruviError("not-connected", { status: 401 })
  let response
  try {
    response = await fetch(`${server}/api/v1${path}`, {
      method,
      headers: { authorization: `Bearer ${key}`, ...(body ? { "content-type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(timeout),
    })
  } catch (error) {
    throw new NaruviError(error?.name === "TimeoutError" ? "timeout" : "offline", { offline: true })
  }
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new NaruviError(data.error || `Naruvi answered ${response.status}`, { status: response.status })
  return data
}

export const appUrl = async (path = "/") => `${(await settings()).server}${path}`
