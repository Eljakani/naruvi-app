/** Board columns and the status each one stands for. Shared by server and client. */
export type Status = "draft" | "parsed" | "analyzed" | "generated" | "ready" | "submitted" | "interviewing" | "offer" | "rejected" | "withdrawn"

export const COLUMNS = [
  { id: "preparing", title: "Saved & analyzed", statuses: ["draft", "parsed", "analyzed"], drop: "analyzed" },
  { id: "documents", title: "Documents", statuses: ["generated", "ready"], drop: "generated" },
  { id: "sent", title: "Sent", statuses: ["submitted"], drop: "submitted" },
  { id: "interviewing", title: "Interviewing", statuses: ["interviewing"], drop: "interviewing" },
  { id: "offer", title: "Offer", statuses: ["offer"], drop: "offer" },
  { id: "closed", title: "Closed", statuses: ["rejected", "withdrawn"], drop: "rejected" },
] as const satisfies readonly { id: string; title: string; statuses: readonly Status[]; drop: Status }[]

export type ColumnId = (typeof COLUMNS)[number]["id"]

export const STATUS_LABEL: Record<Status, string> = {
  draft: "Saved",
  parsed: "Saved",
  analyzed: "Analyzed",
  generated: "CV drafted",
  ready: "Ready to send",
  submitted: "Sent",
  interviewing: "Interviewing",
  offer: "Offer",
  rejected: "Rejected",
  withdrawn: "Withdrawn",
}

/** Statuses the user can pick from a menu (automatic prep stages excluded). */
export const MANUAL_STATUSES: Status[] = ["submitted", "interviewing", "offer", "rejected", "withdrawn"]

export const columnOf = (status: Status): ColumnId => COLUMNS.find((column) => (column.statuses as readonly Status[]).includes(status))?.id ?? "preparing"

const PREP: Status[] = ["draft", "parsed", "analyzed", "generated", "ready"]

/**
 * Status after an automatic step (analysis, generation). Automation only
 * moves applications that are still being prepared; once the user has sent
 * it, re-generating a CV must never pull it back to "CV drafted".
 */
export function automaticStatus(current: Status, next: Status): Status {
  return PREP.includes(current) ? next : current
}

/** Moving to a column keeps the current status when it already belongs there. */
export function statusForColumn(current: Status, column: ColumnId): Status {
  const target = COLUMNS.find((item) => item.id === column)
  if (!target) return current
  if ((target.statuses as readonly Status[]).includes(current)) return current
  return target.drop
}
