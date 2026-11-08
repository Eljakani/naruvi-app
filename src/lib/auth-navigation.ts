/** Only internal application pages may be used as post-login destinations. */
export function authDestination(value: unknown, fallback = "/") {
  if (typeof value !== "string" || value.length > 2048 || !value.startsWith("/") || value.startsWith("//")) return fallback
  try {
    const decoded = decodeURIComponent(value)
    if (/[\\\u0000-\u001f\u007f]/.test(decoded) || decoded.startsWith("//")) return fallback
    const url = new URL(value, "https://naruvi.invalid")
    const path = decodeURIComponent(url.pathname)
    if (url.origin !== "https://naruvi.invalid" || /^\/(login|auth|api|_next)(\/|$)/.test(path)) return fallback
    return url.pathname + url.search + url.hash
  } catch { return fallback }
}
