export type UrlInfo = { url: string; host: string; board: string; jobId: string | null; companySlug: string; canonical: string }
export type ApiCandidate = { url: string; kind: string }
export function parseJobUrl(rawUrl: string): UrlInfo
export function cleanJobUrl(raw: string): string
export function apiCandidates(rawUrl: string): ApiCandidate[]
export function parseJobDocument(input: { html?: string; url?: string; text?: string }): Record<string, unknown>
export function parseJobApi(kind: string, data: unknown, url: string): Record<string, unknown>
export function detectLanguage(text: string, hint?: string): string
