"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"
import { deleteMailAccount, getMailAccount, mailAccountInput, saveMailAccount, testMailConnection, type MailAccountInput, type MailOverview } from "@/server/mail/account"
import { syncMail } from "@/server/mail/sync"

type Result<T = undefined> = { ok: true; data: T; message?: string } | { ok: false; message: string }
const fail = (error: unknown): { ok: false; message: string } => ({
  ok: false,
  message: error instanceof z.ZodError ? (error.issues[0]?.message ?? "Check the form.") : error instanceof Error ? error.message : String(error),
})

/** Log in with these settings without saving them. */
export async function testMailAction(raw: MailAccountInput): Promise<Result<{ messages: number; smtp: string }>> {
  try {
    const input = mailAccountInput.parse(raw)
    const saved = input.password ? null : await getMailAccount()
    const password = input.password || (saved && saved.email.toLowerCase() === input.email.toLowerCase() ? saved.password : "")
    if (!password) return { ok: false, message: "Enter the password (an app password for most providers)." }
    return { ok: true, data: await testMailConnection({ ...input, username: input.username || input.email, password }) }
  } catch (error) {
    return fail(error)
  }
}

export async function saveMailAction(raw: MailAccountInput): Promise<Result<MailOverview>> {
  try {
    const overview = await saveMailAccount(raw)
    revalidatePath("/integrations")
    return { ok: true, data: overview }
  } catch (error) {
    return fail(error)
  }
}

export async function syncMailAction(): Promise<Result<{ checked: number; stored: number }>> {
  try {
    const result = await syncMail()
    revalidatePath("/integrations")
    revalidatePath("/")
    revalidatePath("/applications")
    if (result.skipped) return { ok: false, message: result.skipped }
    return { ok: true, data: { checked: result.checked, stored: result.stored } }
  } catch (error) {
    return fail(error)
  }
}

export async function disconnectMailAction(): Promise<Result> {
  try {
    await deleteMailAccount()
    revalidatePath("/integrations")
    revalidatePath("/")
    return { ok: true, data: undefined }
  } catch (error) {
    return fail(error)
  }
}

export async function calendarAction(change: "enable" | "reset" | "disable"): Promise<Result<{ token: string | null }>> {
  try {
    const { disableCalendar, newCalendarToken } = await import("@/server/integrations/calendar")
    if (change === "disable") {
      await disableCalendar()
      revalidatePath("/integrations")
      return { ok: true, data: { token: null } }
    }
    const token = await newCalendarToken()
    revalidatePath("/integrations")
    return { ok: true, data: { token } }
  } catch (error) {
    return fail(error)
  }
}

export async function saveNotificationsAction(input: { server: string; topic: string; token: string; removeToken: boolean; private: boolean; events: { replies: boolean; due: boolean; leads: boolean } }): Promise<Result> {
  try {
    const { saveNotifications } = await import("@/server/integrations/notify")
    await saveNotifications(input)
    revalidatePath("/integrations")
    return { ok: true, data: undefined }
  } catch (error) {
    return fail(error)
  }
}

export async function testNotificationAction(): Promise<Result> {
  try {
    const { sendTestNotification } = await import("@/server/integrations/notify")
    await sendTestNotification()
    return { ok: true, data: undefined }
  } catch (error) {
    return fail(error)
  }
}

export async function disableNotificationsAction(): Promise<Result> {
  const { disableNotifications } = await import("@/server/integrations/notify")
  await disableNotifications()
  revalidatePath("/integrations")
  return { ok: true, data: undefined }
}

export async function createApiKeyAction(name: string): Promise<Result<{ token: string }>> {
  try {
    const { createApiKey } = await import("@/server/integrations/api")
    const token = await createApiKey(z.string().max(60).parse(name))
    revalidatePath("/integrations")
    return { ok: true, data: { token } }
  } catch (error) {
    return fail(error)
  }
}

export async function revokeApiKeyAction(id: string): Promise<Result> {
  const { revokeApiKey } = await import("@/server/integrations/api")
  await revokeApiKey(z.string().uuid().parse(id))
  revalidatePath("/integrations")
  return { ok: true, data: undefined }
}

export async function saveReplySettingAction(value: { mode: "off" | "plus" | "domain"; domain?: string }): Promise<Result> {
  try {
    const { saveReplySetting } = await import("@/server/mail/account")
    await saveReplySetting(value)
    revalidatePath("/integrations")
    return { ok: true, data: undefined }
  } catch (error) {
    return fail(error)
  }
}
