"use server"

import { cookies, headers } from "next/headers"
import { revalidatePath } from "next/cache"
import { z } from "zod"
import { deleteMailAccount, getMailAccount, mailAccountInput, saveMailAccount, saveResendAccount, testMailConnection, type MailAccountInput, type MailOverview, type ResendAccountInput } from "@/server/mail/account"
import { syncMail } from "@/server/mail/sync"
import { serverError } from "@/i18n/server-errors"

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
    const password = input.password || (saved?.authType === "password" && saved.email.toLowerCase() === input.email.toLowerCase() ? saved.password : "")
    if (!password) return { ok: false, message: await serverError("enterThePasswordAn") }
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

export async function startResendOAuthAction(input: Omit<ResendAccountInput, "apiKey">): Promise<Result<{ url: string }>> {
  try {
    const origin = (await headers()).get("origin")
    if (!origin) return { ok: false, message: await serverError("openEmailSettingsIn") }
    const { startResendOAuth, resendOAuthCookie, resendOAuthPath } = await import("@/server/mail/resend-oauth")
    const flow = await startResendOAuth(origin, input)
    const jar = await cookies()
    jar.set(resendOAuthCookie, flow.cookie, {
      httpOnly: true, sameSite: "lax", secure: flow.secure, path: resendOAuthPath, maxAge: 600,
    })
    return { ok: true, data: { url: flow.url } }
  } catch (error) {
    return fail(error)
  }
}

export async function saveResendAction(raw: ResendAccountInput): Promise<Result> {
  try {
    await saveResendAccount(raw)
    revalidatePath("/integrations")
    revalidatePath("/applications")
    return { ok: true, data: undefined }
  } catch (error) {
    return fail(error)
  }
}

export async function syncMailAction(): Promise<Result<{ checked: number; stored: number }>> {
  try {
    const result = await syncMail({ rescan: true })
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

export async function saveOAuthClientAction(provider: "google" | "microsoft", input: { clientId: string; clientSecret: string; tenant: string }): Promise<Result> {
  try {
    if (provider !== "google" && provider !== "microsoft") return { ok: false, message: await serverError("unknownProvider") }
    const { saveOAuthClient } = await import("@/server/mail/oauth")
    await saveOAuthClient(provider, input)
    revalidatePath("/integrations")
    return { ok: true, data: undefined }
  } catch (error) {
    return fail(error)
  }
}

export async function saveSalaryDataAction(input: { appId: string; appKey: string }): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    const { saveSalaryData } = await import("@/server/salary/market")
    await saveSalaryData(z.object({ appId: z.string().max(100), appKey: z.string().max(200) }).parse(input))
    revalidatePath("/integrations")
    return { ok: true }
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : String(error) }
  }
}

export async function setCompanyFactsAction(enabled: boolean): Promise<{ ok: true }> {
  const { setCompanyFactsEnabled } = await import("@/server/companies/profile")
  await setCompanyFactsEnabled(Boolean(enabled))
  revalidatePath("/integrations")
  return { ok: true }
}
