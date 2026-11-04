export function hostOf(value: string): string
export function isJobHost(hostOrUrl: string): boolean
export function registrableDomain(host: string): string
export function nameMatch(company: string, host: string): number
export type SiteResolution = { url: string; source: string; confidence: number }
export function resolveCompanySite(
  input: { company: string; pageUrl?: string; finalUrl?: string; structuredUrls?: string[]; html?: string; description?: string },
  fetchHtml: (url: string) => Promise<{ html: string; finalUrl?: string } | null>,
): Promise<SiteResolution>
export function postingLogoCandidates(html: string, baseUrl: string, options?: { company?: string; structuredLogo?: string }): { url: string; priority: number; source: string }[]
