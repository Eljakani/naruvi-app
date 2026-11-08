"use server"

import { inbox, markInboxSeen } from "@/server/notifications/inbox"

export async function inboxAction() {
  return inbox().catch(() => ({ items: [], seenAt: new Date().toISOString() }))
}

export async function markInboxSeenAction() {
  return markInboxSeen()
}
