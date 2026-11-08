import { isJobHost, registrableDomain } from "@/server/jobs/vendor/company-resolver"

/** A homepage may move to the same brand under a different country domain. */
export function companyRedirectAllowed(from: string, to: string) {
  const original = new URL(from)
  const target = new URL(to)
  if (!/^https?:$/.test(target.protocol) || target.username || target.password) return false
  if (original.protocol === "https:" && target.protocol !== "https:") return false
  const domain = registrableDomain(original.hostname)
  const redirected = registrableDomain(target.hostname)
  return domain === redirected || (!isJobHost(target.hostname) && domain.split(".")[0] === redirected.split(".")[0])
}
